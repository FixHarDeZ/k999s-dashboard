package k8s

import (
	"context"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// Client wraps the Kubernetes clientset with domain-specific methods.
type Client struct {
	kube           kubernetes.Interface
	currentContext string
	kubeconfigPath string
}

// NewClient creates a real client from kubeconfig file.
func NewClient(kubeconfigPath, context string) (*Client, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loadingRules.ExplicitPath = kubeconfigPath
	}
	configOverrides := &clientcmd.ConfigOverrides{}
	if context != "" {
		configOverrides.CurrentContext = context
	}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)
	restConfig, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}
	rawConfig, _ := kubeConfig.RawConfig()
	return &Client{kube: clientset, currentContext: rawConfig.CurrentContext, kubeconfigPath: kubeconfigPath}, nil
}

// NewClientFromKubernetesClient creates a client from an existing kubernetes.Interface (for testing).
func NewClientFromKubernetesClient(kube kubernetes.Interface, context string) *Client {
	return &Client{kube: kube, currentContext: context}
}

// ListPods returns pod summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListPods(ctx context.Context, namespace string) ([]PodSummary, error) {
	list, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]PodSummary, 0, len(list.Items))
	for _, p := range list.Items {
		summaries = append(summaries, toPodSummary(p))
	}
	return summaries, nil
}

// ListNamespaces returns the names of all namespaces.
func (c *Client) ListNamespaces(ctx context.Context) ([]string, error) {
	list, err := c.kube.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	return names, nil
}

// ListDeployments returns deployment summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListDeployments(ctx context.Context, namespace string) ([]DeploymentSummary, error) {
	list, err := c.kube.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]DeploymentSummary, 0, len(list.Items))
	for _, d := range list.Items {
		summaries = append(summaries, toDeploymentSummary(d))
	}
	return summaries, nil
}

// GetContexts returns kubeconfig context information.
func (c *Client) GetContexts() ([]ContextInfo, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if c.kubeconfigPath != "" {
		loadingRules.ExplicitPath = c.kubeconfigPath
	}
	rawConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, &clientcmd.ConfigOverrides{},
	).RawConfig()
	if err != nil {
		return nil, err
	}
	contexts := make([]ContextInfo, 0, len(rawConfig.Contexts))
	for name, ctx := range rawConfig.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:    name,
			Current: name == rawConfig.CurrentContext,
			Cluster: ctx.Cluster,
		})
	}
	return contexts, nil
}

func toPodSummary(p corev1.Pod) PodSummary {
	readyCount := 0
	totalCount := len(p.Spec.Containers)
	var restarts int32
	for _, cs := range p.Status.ContainerStatuses {
		if cs.Ready {
			readyCount++
		}
		restarts += cs.RestartCount
	}
	return PodSummary{
		Name:      p.Name,
		Namespace: p.Namespace,
		Status:    string(p.Status.Phase),
		Ready:     fmt.Sprintf("%d/%d", readyCount, totalCount),
		Restarts:  restarts,
		Age:       formatAge(p.CreationTimestamp.Time),
		Node:      p.Spec.NodeName,
		IP:        p.Status.PodIP,
	}
}

func toDeploymentSummary(d appsv1.Deployment) DeploymentSummary {
	return DeploymentSummary{
		Name:      d.Name,
		Namespace: d.Namespace,
		Ready:     fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, d.Status.Replicas),
		UpToDate:  d.Status.UpdatedReplicas,
		Available: d.Status.AvailableReplicas,
		Age:       formatAge(d.CreationTimestamp.Time),
	}
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}
