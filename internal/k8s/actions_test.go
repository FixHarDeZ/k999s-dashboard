package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDeletePod_RemovesPod(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeletePod(context.Background(), "default", "pod-1")
	require.NoError(t, err)

	pods, _ := fakeClient.CoreV1().Pods("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, pods.Items, 0)
}

func TestScaleDeployment_UpdatesReplicas(t *testing.T) {
	replicas := int32(3)
	fakeClient := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Replicas: &replicas},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.ScaleDeployment(context.Background(), "default", "api", 5)
	require.NoError(t, err)

	d, _ := fakeClient.AppsV1().Deployments("default").Get(context.Background(), "api", metav1.GetOptions{})
	assert.Equal(t, int32(5), *d.Spec.Replicas)
}

func TestCordonNode_SetsUnschedulable(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.CordonNode(context.Background(), "node-1", true)
	require.NoError(t, err)
	node, _ := fakeClient.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	assert.True(t, node.Spec.Unschedulable)
}

func TestUncordonNode_ClearsUnschedulable(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{
			ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
			Spec:       corev1.NodeSpec{Unschedulable: true},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.CordonNode(context.Background(), "node-1", false)
	require.NoError(t, err)
	node, _ := fakeClient.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	assert.False(t, node.Spec.Unschedulable)
}

func TestDrainNode_CordonsAndDeletesNonDaemonSetPods(t *testing.T) {
	daemonPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "ds-pod", Namespace: "default",
			OwnerReferences: []metav1.OwnerReference{{Kind: "DaemonSet", Name: "ds-1"}},
		},
		Spec: corev1.PodSpec{NodeName: "node-1"},
	}
	normalPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "normal-pod", Namespace: "default"},
		Spec:       corev1.PodSpec{NodeName: "node-1"},
	}
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}},
		daemonPod,
		normalPod,
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DrainNode(context.Background(), "node-1")
	require.NoError(t, err)

	// Node cordoned
	node, _ := fakeClient.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	assert.True(t, node.Spec.Unschedulable)

	// DaemonSet pod still exists
	_, err = fakeClient.CoreV1().Pods("default").Get(context.Background(), "ds-pod", metav1.GetOptions{})
	assert.NoError(t, err, "DaemonSet pod should NOT be deleted")

	// Normal pod deleted
	_, err = fakeClient.CoreV1().Pods("default").Get(context.Background(), "normal-pod", metav1.GetOptions{})
	assert.Error(t, err, "normal pod should be deleted")
}

func TestRolloutRestartDaemonSet_NoError(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.RolloutRestartDaemonSet(context.Background(), "default", "ds-1")
	require.NoError(t, err)
}

func TestDeleteDaemonSet_RemovesDaemonSet(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeleteDaemonSet(context.Background(), "default", "ds-1")
	require.NoError(t, err)
	list, _ := fakeClient.AppsV1().DaemonSets("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, list.Items, 0)
}

func TestDeleteJob_RemovesJob(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.Job{ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeleteJob(context.Background(), "default", "backup")
	require.NoError(t, err)
	list, _ := fakeClient.BatchV1().Jobs("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, list.Items, 0)
}

func TestDeleteCronJob_RemovesCronJob(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeleteCronJob(context.Background(), "default", "backup")
	require.NoError(t, err)
	list, _ := fakeClient.BatchV1().CronJobs("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, list.Items, 0)
}

func TestPatchHPALimits_NoError(t *testing.T) {
	minRep := int32(2)
	fakeClient := fake.NewSimpleClientset(
		&autoscalingv2.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "my-hpa", Namespace: "default"},
			Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
				MinReplicas: &minRep,
				MaxReplicas: 10,
				ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{Kind: "Deployment", Name: "my-app"},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.PatchHPALimits(context.Background(), "default", "my-hpa", 1, 5)
	require.NoError(t, err)
}

func TestTriggerCronJob_CreatesJob(t *testing.T) {
	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default", UID: "uid-1"},
		Spec: batchv1.CronJobSpec{
			Schedule: "*/5 * * * *",
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							Containers:    []corev1.Container{{Name: "c", Image: "busybox"}},
							RestartPolicy: corev1.RestartPolicyNever,
						},
					},
				},
			},
		},
	}
	fakeClient := fake.NewSimpleClientset(cj)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.TriggerCronJob(context.Background(), "default", "backup")
	require.NoError(t, err)
	jobs, err := fakeClient.BatchV1().Jobs("default").List(context.Background(), metav1.ListOptions{})
	require.NoError(t, err)
	assert.Len(t, jobs.Items, 1)
	assert.Contains(t, jobs.Items[0].Name, "backup-manual-")
}

func TestRollbackDeployment_PatchesToPreviousRevision(t *testing.T) {
	replicas := int32(1)
	fakeClient := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:        "my-app",
				Namespace:   "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "2"},
				UID:         "deploy-uid",
			},
			Spec: appsv1.DeploymentSpec{Replicas: &replicas},
		},
		&appsv1.ReplicaSet{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-app-v1",
				Namespace: "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "1"},
				OwnerReferences: []metav1.OwnerReference{
					{Kind: "Deployment", Name: "my-app", UID: "deploy-uid"},
				},
			},
			Spec: appsv1.ReplicaSetSpec{
				Template: corev1.PodTemplateSpec{
					ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"version": "v1"}},
				},
			},
		},
		&appsv1.ReplicaSet{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-app-v2",
				Namespace: "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "2"},
				OwnerReferences: []metav1.OwnerReference{
					{Kind: "Deployment", Name: "my-app", UID: "deploy-uid"},
				},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.RollbackDeployment(context.Background(), "default", "my-app")
	require.NoError(t, err)
}

func TestRollbackDeployment_NoPreviousRevision(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:        "my-app",
				Namespace:   "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "1"},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.RollbackDeployment(context.Background(), "default", "my-app")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no previous revision")
}
