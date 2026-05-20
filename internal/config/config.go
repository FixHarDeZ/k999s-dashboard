package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type AIConfig struct {
	Provider string `yaml:"provider"`
	APIKey   string `yaml:"api_key"`
	Model    string `yaml:"model"`
	BaseURL  string `yaml:"base_url"`
}

type Config struct {
	KubeconfigPath string   `yaml:"-"`
	CurrentContext string   `yaml:"current_context"`
	AI             AIConfig `yaml:"ai"`
}

func Load(kubeconfigPath string) (*Config, error) {
	if kubeconfigPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		kubeconfigPath = filepath.Join(home, ".kube", "config")
	}

	cfg := &Config{
		KubeconfigPath: kubeconfigPath,
		AI: AIConfig{
			Provider: "ollama",
			Model:    "llama3.2",
		},
	}

	appConfigPath := appConfigPath()
	data, err := os.ReadFile(appConfigPath)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if err == nil {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, err
		}
		cfg.KubeconfigPath = kubeconfigPath
	}

	return cfg, nil
}

func appConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".k999s", "config.yaml")
}
