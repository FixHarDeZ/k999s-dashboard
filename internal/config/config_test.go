package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/k999s/dashboard/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_DefaultKubeconfigPath(t *testing.T) {
	home, _ := os.UserHomeDir()
	cfg, err := config.Load("")
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(home, ".kube", "config"), cfg.KubeconfigPath)
}

func TestLoad_CustomKubeconfigPath(t *testing.T) {
	cfg, err := config.Load("/custom/path/kubeconfig")
	require.NoError(t, err)
	assert.Equal(t, "/custom/path/kubeconfig", cfg.KubeconfigPath)
}

func TestLoad_AIDefaults(t *testing.T) {
	cfg, err := config.Load("")
	require.NoError(t, err)
	assert.Equal(t, "ollama", cfg.AI.Provider)
	assert.Equal(t, "llama3.2", cfg.AI.Model)
}
