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

func TestGetTopology_BuildsEdgesFromLabelSelectors(t *testing.T) {
	labels := map[string]string{"app": "nginx"}
	selector := &metav1.LabelSelector{MatchLabels: labels}

	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name: "nginx-pod", Namespace: "default", Labels: labels,
			},
			Status: corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Selector: selector},
			Status:     appsv1.DeploymentStatus{Replicas: 1, ReadyReplicas: 1},
		},
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx-svc", Namespace: "default"},
			Spec:       corev1.ServiceSpec{Selector: labels, Type: corev1.ServiceTypeClusterIP},
		},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	graph, err := client.GetTopology(context.Background(), "default")

	require.NoError(t, err)
	assert.Len(t, graph.Nodes, 3)
	assert.Len(t, graph.Edges, 2)
}
