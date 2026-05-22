package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
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

func (c *Client) RolloutRestartDaemonSet(ctx context.Context, namespace, name string) error {
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().UTC().Format(time.RFC3339),
	)
	_, err := c.kube.AppsV1().DaemonSets(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}

func (c *Client) DeleteDaemonSet(ctx context.Context, namespace, name string) error {
	return c.kube.AppsV1().DaemonSets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteJob(ctx context.Context, namespace, name string) error {
	return c.kube.BatchV1().Jobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) DeleteCronJob(ctx context.Context, namespace, name string) error {
	return c.kube.BatchV1().CronJobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) PatchHPALimits(ctx context.Context, namespace, name string, min, max int32) error {
	patch := fmt.Sprintf(`{"spec":{"minReplicas":%d,"maxReplicas":%d}}`, min, max)
	_, err := c.kube.AutoscalingV2().HorizontalPodAutoscalers(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}

func (c *Client) TriggerCronJob(ctx context.Context, namespace, name string) error {
	cj, err := c.kube.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get cronjob: %w", err)
	}
	t := true
	jobName := fmt.Sprintf("%s-manual-%d", name, time.Now().Unix())
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: namespace,
			OwnerReferences: []metav1.OwnerReference{
				{
					APIVersion: "batch/v1",
					Kind:       "CronJob",
					Name:       cj.Name,
					UID:        cj.UID,
					Controller: &t,
				},
			},
		},
		Spec: cj.Spec.JobTemplate.Spec,
	}
	_, err = c.kube.BatchV1().Jobs(namespace).Create(ctx, job, metav1.CreateOptions{})
	return err
}

func (c *Client) RollbackDeployment(ctx context.Context, namespace, name string) error {
	deploy, err := c.kube.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get deployment: %w", err)
	}
	currentRevision, err := strconv.ParseInt(deploy.Annotations["deployment.kubernetes.io/revision"], 10, 64)
	if err != nil {
		return fmt.Errorf("parse revision annotation: %w", err)
	}
	targetRevision := fmt.Sprintf("%d", currentRevision-1)

	rsList, err := c.kube.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list replicasets: %w", err)
	}

	var targetRS *appsv1.ReplicaSet
	for i := range rsList.Items {
		rs := &rsList.Items[i]
		if rs.Annotations["deployment.kubernetes.io/revision"] != targetRevision {
			continue
		}
		for _, ref := range rs.OwnerReferences {
			if ref.Kind == "Deployment" && ref.Name == name {
				targetRS = rs
				break
			}
		}
		if targetRS != nil {
			break
		}
	}
	if targetRS == nil {
		return fmt.Errorf("no previous revision found for deployment %s", name)
	}

	templateJSON, err := json.Marshal(targetRS.Spec.Template)
	if err != nil {
		return fmt.Errorf("marshal template: %w", err)
	}
	patch := fmt.Sprintf(`{"spec":{"template":%s}}`, string(templateJSON))
	_, err = c.kube.AppsV1().Deployments(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}
