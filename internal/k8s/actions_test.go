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
