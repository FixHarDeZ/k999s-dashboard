package k8s

import (
	"context"
	"fmt"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type TopologyNode struct {
	ID        string            `json:"id"`
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Status    string            `json:"status"`
	Labels    map[string]string `json:"labels,omitempty"`
}

type TopologyEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"`
}

type TopologyGraph struct {
	Nodes []TopologyNode `json:"nodes"`
	Edges []TopologyEdge `json:"edges"`
}

func (c *Client) GetTopology(ctx context.Context, namespace string) (*TopologyGraph, error) {
	pods, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	deployments, err := c.kube.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	services, err := c.kube.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	ingresses, err := c.kube.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		ingresses = &networkingv1.IngressList{}
	}

	var nodes []TopologyNode
	var edges []TopologyEdge

	type podEntry struct {
		id     string
		labels map[string]string
	}
	podEntries := make([]podEntry, 0, len(pods.Items))
	for _, p := range pods.Items {
		id := fmt.Sprintf("pod/%s/%s", p.Namespace, p.Name)
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Pod", Name: p.Name, Namespace: p.Namespace,
			Status: string(p.Status.Phase), Labels: p.Labels,
		})
		podEntries = append(podEntries, podEntry{id: id, labels: p.Labels})
	}

	svcIDs := map[string]string{}
	for _, s := range services.Items {
		if len(s.Spec.Selector) == 0 {
			continue
		}
		id := fmt.Sprintf("service/%s/%s", s.Namespace, s.Name)
		svcIDs[s.Name] = id
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Service", Name: s.Name, Namespace: s.Namespace,
			Status: string(s.Spec.Type),
		})
		for _, pe := range podEntries {
			if labelsMatchSelector(pe.labels, s.Spec.Selector) {
				edges = append(edges, TopologyEdge{Source: id, Target: pe.id, Label: "selects"})
			}
		}
	}

	for _, d := range deployments.Items {
		id := fmt.Sprintf("deployment/%s/%s", d.Namespace, d.Name)
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Deployment", Name: d.Name, Namespace: d.Namespace,
			Status: fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, d.Status.Replicas),
		})
		if d.Spec.Selector != nil && len(d.Spec.Selector.MatchLabels) > 0 {
			for _, pe := range podEntries {
				if labelsMatchSelector(pe.labels, d.Spec.Selector.MatchLabels) {
					edges = append(edges, TopologyEdge{Source: id, Target: pe.id, Label: "manages"})
				}
			}
		}
	}

	for _, ing := range ingresses.Items {
		id := fmt.Sprintf("ingress/%s/%s", ing.Namespace, ing.Name)
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Ingress", Name: ing.Name, Namespace: ing.Namespace, Status: "Active",
		})
		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service == nil {
					continue
				}
				if svcID, ok := svcIDs[path.Backend.Service.Name]; ok {
					edges = append(edges, TopologyEdge{Source: id, Target: svcID, Label: "routes"})
				}
			}
		}
	}

	return &TopologyGraph{Nodes: nodes, Edges: edges}, nil
}

func labelsMatchSelector(labels, selector map[string]string) bool {
	if len(selector) == 0 {
		return false
	}
	for k, v := range selector {
		if labels[k] != v {
			return false
		}
	}
	return true
}
