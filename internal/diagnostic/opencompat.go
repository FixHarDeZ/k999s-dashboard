package diagnostic

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// OpenCompatProvider handles OpenAI-compatible APIs (OpenAI, OpenRouter) via SSE.
type OpenCompatProvider struct {
	apiKey  string
	model   string
	baseURL string
}

func NewOpenCompat(apiKey, model, baseURL string) *OpenCompatProvider {
	return &OpenCompatProvider{apiKey: apiKey, model: model, baseURL: baseURL}
}

func (p *OpenCompatProvider) Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": buildPrompt(input)},
		},
		"stream": true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai-compat request failed: %w", err)
	}

	ch := make(chan string, 16)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}
			var msg struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &msg); err != nil {
				continue
			}
			if len(msg.Choices) > 0 && msg.Choices[0].Delta.Content != "" {
				select {
				case ch <- msg.Choices[0].Delta.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
