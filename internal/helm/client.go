package helm

import (
	"encoding/json"
	"fmt"
	"os/exec"
)

// Client wraps the helm CLI.
type Client struct {
	kubeconfigPath string
	kubeContext    string
}

// NewClient creates a new helm client. kubeconfigPath and kubeContext may be empty
// (helm will use defaults from the environment).
func NewClient(kubeconfigPath, kubeContext string) *Client {
	return &Client{kubeconfigPath: kubeconfigPath, kubeContext: kubeContext}
}

// helmListItem mirrors the helm list -o json output exactly.
type helmListItem struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"app_version"`
}

// ReleaseSummary is the API response type for a single Helm release.
type ReleaseSummary struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"appVersion"`
}

// ListReleases returns release summaries. Pass namespace="" for all namespaces.
func (c *Client) ListReleases(namespace string) ([]ReleaseSummary, error) {
	args := []string{"list", "-o", "json"}
	if namespace == "" {
		args = append(args, "--all-namespaces")
	} else {
		args = append(args, "-n", namespace)
	}
	args = c.appendKubeFlags(args)

	out, err := exec.Command("helm", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("helm list: %w", err)
	}

	var items []helmListItem
	if err := json.Unmarshal(out, &items); err != nil {
		return nil, fmt.Errorf("parse helm output: %w", err)
	}

	summaries := make([]ReleaseSummary, len(items))
	for i, item := range items {
		summaries[i] = ReleaseSummary{
			Name:       item.Name,
			Namespace:  item.Namespace,
			Revision:   item.Revision,
			Updated:    item.Updated,
			Status:     item.Status,
			Chart:      item.Chart,
			AppVersion: item.AppVersion,
		}
	}
	return summaries, nil
}

// UninstallRelease runs `helm uninstall <name> -n <namespace>`.
func (c *Client) UninstallRelease(namespace, name string) error {
	args := []string{"uninstall", name, "-n", namespace}
	args = c.appendKubeFlags(args)
	if err := exec.Command("helm", args...).Run(); err != nil {
		return fmt.Errorf("helm uninstall %s/%s: %w", namespace, name, err)
	}
	return nil
}

func (c *Client) appendKubeFlags(args []string) []string {
	if c.kubeconfigPath != "" {
		args = append(args, "--kubeconfig", c.kubeconfigPath)
	}
	if c.kubeContext != "" {
		args = append(args, "--kube-context", c.kubeContext)
	}
	return args
}
