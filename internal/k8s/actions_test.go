package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
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
