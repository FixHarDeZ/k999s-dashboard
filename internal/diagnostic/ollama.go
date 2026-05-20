package diagnostic

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// OllamaProvider calls a local Ollama server (newline-delimited JSON streaming).
type OllamaProvider struct {
	model   string
	baseURL string
}

func NewOllama(model, baseURL string) *OllamaProvider {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	return &OllamaProvider{model: model, baseURL: baseURL}
}

func (p *OllamaProvider) Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": buildPrompt(input)},
		},
		"stream": true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}

	ch := make(chan string, 16)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			var msg struct {
				Message struct{ Content string `json:"content"` } `json:"message"`
				Done    bool                                      `json:"done"`
			}
			if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
				continue
			}
			if msg.Message.Content != "" {
				select {
				case ch <- msg.Message.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
