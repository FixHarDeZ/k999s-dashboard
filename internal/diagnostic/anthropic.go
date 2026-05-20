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

// AnthropicProvider calls the Anthropic Messages API with SSE streaming.
type AnthropicProvider struct {
	apiKey string
	model  string
}

func NewAnthropic(apiKey, model string) *AnthropicProvider {
	return &AnthropicProvider{apiKey: apiKey, model: model}
}

func (p *AnthropicProvider) Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error) {
	body, _ := json.Marshal(map[string]any{
		"model":      p.model,
		"max_tokens": 1024,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": buildPrompt(input)},
		},
		"stream": true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("anthropic request failed: %w", err)
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
			var msg struct {
				Type  string `json:"type"`
				Delta struct {
					Text string `json:"text"`
				} `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &msg); err != nil {
				continue
			}
			if msg.Type == "content_block_delta" && msg.Delta.Text != "" {
				select {
				case ch <- msg.Delta.Text:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
