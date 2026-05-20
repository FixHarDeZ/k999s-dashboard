package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ListEvents returns event summaries for the given namespace ("" = all).
func (c *Client) ListEvents(ctx context.Context, namespace string) ([]EventSummary, error) {
	list, err := c.kube.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]EventSummary, 0, len(list.Items))
	for _, e := range list.Items {
		out = append(out, EventSummary{
			Name:      e.Name,
			Namespace: e.Namespace,
			Reason:    e.Reason,
			Message:   e.Message,
			Type:      e.Type,
			Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Count:     e.Count,
			Age:       formatAge(e.CreationTimestamp.Time),
		})
	}
	return out, nil
}
