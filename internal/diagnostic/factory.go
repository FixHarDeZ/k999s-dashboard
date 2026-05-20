package diagnostic

import (
	"fmt"

	"github.com/k999s/dashboard/internal/config"
)

// New creates a Provider from the app config.
// Returns nil, nil when provider is empty (AI disabled).
func New(cfg config.AIConfig) (Provider, error) {
	switch cfg.Provider {
	case "", "none":
		return nil, nil
	case "ollama":
		return NewOllama(cfg.Model, cfg.BaseURL), nil
	case "openrouter":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("openrouter requires api_key in ~/.k999s/config.yaml")
		}
		baseURL := cfg.BaseURL
		if baseURL == "" {
			baseURL = "https://openrouter.ai/api/v1"
		}
		return NewOpenCompat(cfg.APIKey, cfg.Model, baseURL), nil
	case "openai":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("openai requires api_key in ~/.k999s/config.yaml")
		}
		return NewOpenCompat(cfg.APIKey, cfg.Model, "https://api.openai.com/v1"), nil
	case "anthropic":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("anthropic requires api_key in ~/.k999s/config.yaml")
		}
		return NewAnthropic(cfg.APIKey, cfg.Model), nil
	default:
		return nil, fmt.Errorf("unknown AI provider %q — valid values: ollama, openrouter, openai, anthropic", cfg.Provider)
	}
}
