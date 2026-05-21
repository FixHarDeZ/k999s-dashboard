package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

type APIResourceInfo struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Group      string `json:"group"`
	Version    string `json:"version"`
	Namespaced bool   `json:"namespaced"`
}

func (c *Client) ListAPIResources() ([]APIResourceInfo, error) {
	_, lists, err := c.kube.Discovery().ServerGroupsAndResources()
	if err != nil && lists == nil {
		return nil, err
	}
	var resources []APIResourceInfo
	for _, list := range lists {
		gv, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}
		for _, r := range list.APIResources {
			if !r.Namespaced {
				continue
			}
			if strings.Contains(r.Name, "/") {
				continue
			}
			resources = append(resources, APIResourceInfo{
				Name:       r.Name,
				Kind:       r.Kind,
				Group:      gv.Group,
				Version:    gv.Version,
				Namespaced: r.Namespaced,
			})
		}
	}
	return resources, nil
}

func (c *Client) ListResourceRaw(ctx context.Context, group, version, resource, namespace string) ([]map[string]any, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("dynamic client not available: no REST config")
	}
	dc, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	list, err := dc.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, item.Object)
	}
	return items, nil
}

func (c *Client) GetResourceRaw(ctx context.Context, group, version, resource, namespace, name string) ([]byte, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("dynamic client not available: no REST config")
	}
	dc, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	obj, err := dc.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return json.MarshalIndent(obj.Object, "", "  ")
}

// ApplyResourceRaw updates a resource using the provided JSON data.
// The resourceVersion from the server is always preserved to satisfy optimistic concurrency.
func (c *Client) ApplyResourceRaw(ctx context.Context, group, version, resource, namespace, name string, data []byte) error {
	if c.restConfig == nil {
		return fmt.Errorf("dynamic client not available: no REST config")
	}
	var objMap map[string]any
	if err := json.Unmarshal(data, &objMap); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	dc, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return err
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	// Fetch current resourceVersion (required by K8s optimistic concurrency)
	existing, err := dc.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get existing resource: %w", err)
	}
	if meta, ok := existing.Object["metadata"].(map[string]any); ok {
		if rv, ok := meta["resourceVersion"]; ok {
			if objMeta, ok := objMap["metadata"].(map[string]any); ok {
				objMeta["resourceVersion"] = rv
			}
		}
	}
	existing.Object = objMap
	_, err = dc.Resource(gvr).Namespace(namespace).Update(ctx, existing, metav1.UpdateOptions{})
	return err
}
