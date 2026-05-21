package k8s

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

func (c *Client) DeletePod(ctx context.Context, namespace, name string) error {
	return c.kube.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) RestartPod(ctx context.Context, namespace, name string) error {
	return c.kube.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) ScaleDeployment(ctx context.Context, namespace, name string, replicas int32) error {
	d, err := c.kube.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get deployment: %w", err)
	}
	d.Spec.Replicas = &replicas
	_, err = c.kube.AppsV1().Deployments(namespace).Update(ctx, d, metav1.UpdateOptions{})
	return err
}

func (c *Client) RolloutRestartDeployment(ctx context.Context, namespace, name string) error {
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().UTC().Format(time.RFC3339),
	)
	_, err := c.kube.AppsV1().Deployments(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}

func (c *Client) DeleteDeployment(ctx context.Context, namespace, name string) error {
	return c.kube.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// CordonNode marks the node schedulable (false) or unschedulable (true).
func (c *Client) CordonNode(ctx context.Context, name string, unschedulable bool) error {
	node, err := c.kube.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}
	node.Spec.Unschedulable = unschedulable
	_, err = c.kube.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	return err
}

// DrainNode cordons the node then deletes all non-DaemonSet, non-mirror pods running on it.
func (c *Client) DrainNode(ctx context.Context, name string) error {
	if err := c.CordonNode(ctx, name, true); err != nil {
		return err
	}
	pods, err := c.kube.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + name,
	})
	if err != nil {
		return err
	}
	for _, pod := range pods.Items {
		if isOwnedByDaemonSet(pod) || isMirrorPod(pod) {
			continue
		}
		_ = c.kube.CoreV1().Pods(pod.Namespace).Delete(ctx, pod.Name, metav1.DeleteOptions{})
	}
	return nil
}

func isOwnedByDaemonSet(pod corev1.Pod) bool {
	for _, ref := range pod.OwnerReferences {
		if ref.Kind == "DaemonSet" {
			return true
		}
	}
	return false
}

func isMirrorPod(pod corev1.Pod) bool {
	_, ok := pod.Annotations["kubernetes.io/config.mirror"]
	return ok
}
