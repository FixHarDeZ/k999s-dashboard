package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

// ListPodMetrics returns CPU/memory per pod. Returns empty list (no error) if metrics-server unavailable.
func (c *Client) ListPodMetrics(ctx context.Context, namespace string) ([]PodMetricsSummary, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("metrics not available: no REST config")
	}
	mc, err := metricsclient.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	list, err := mc.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// metrics-server not installed — return empty list gracefully
		return []PodMetricsSummary{}, nil
	}
	out := make([]PodMetricsSummary, 0, len(list.Items))
	for _, m := range list.Items {
		var cpuTotal, memTotal int64
		for _, ctr := range m.Containers {
			cpuTotal += ctr.Usage.Cpu().MilliValue()
			memTotal += ctr.Usage.Memory().Value()
		}
		out = append(out, PodMetricsSummary{
			Name:      m.Name,
			Namespace: m.Namespace,
			CPU:       fmt.Sprintf("%dm", cpuTotal),
			Memory:    formatBytes(memTotal),
		})
	}
	return out, nil
}

// ListNodeMetrics returns CPU/memory per node. Returns empty list (no error) if metrics-server unavailable.
func (c *Client) ListNodeMetrics(ctx context.Context) ([]NodeMetricsSummary, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("metrics not available: no REST config")
	}
	mc, err := metricsclient.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	list, err := mc.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return []NodeMetricsSummary{}, nil
	}
	out := make([]NodeMetricsSummary, 0, len(list.Items))
	for _, m := range list.Items {
		out = append(out, NodeMetricsSummary{
			Name:   m.Name,
			CPU:    fmt.Sprintf("%dm", m.Usage.Cpu().MilliValue()),
			Memory: formatBytes(m.Usage.Memory().Value()),
		})
	}
	return out, nil
}

func formatBytes(b int64) string {
	const mi = 1024 * 1024
	if b >= 1024*mi {
		return fmt.Sprintf("%.1fGi", float64(b)/float64(1024*mi))
	}
	return fmt.Sprintf("%dMi", b/mi)
}
