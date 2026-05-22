package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListPods_ReturnsPodsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "other"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	pods, err := client.ListPods(context.Background(), "default")

	require.NoError(t, err)
	assert.Len(t, pods, 1)
	assert.Equal(t, "pod-1", pods[0].Name)
}

func TestListPods_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"}},
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "other"}},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	pods, err := client.ListPods(context.Background(), "")

	require.NoError(t, err)
	assert.Len(t, pods, 2)
}

func TestListNamespaces_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "kube-system"}},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	namespaces, err := client.ListNamespaces(context.Background())

	require.NoError(t, err)
	assert.Len(t, namespaces, 2)
}

func TestListServices_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "svc-1", Namespace: "default"},
			Spec:       corev1.ServiceSpec{Type: corev1.ServiceTypeClusterIP, ClusterIP: "10.0.0.1"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	svcs, err := client.ListServices(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, svcs, 1)
	assert.Equal(t, "svc-1", svcs[0].Name)
}

func TestListNodes_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	nodes, err := client.ListNodes(context.Background())
	require.NoError(t, err)
	assert.Len(t, nodes, 1)
	assert.Equal(t, "node-1", nodes[0].Name)
}

func TestListIngresses_ReturnsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{Name: "ing-1", Namespace: "default"},
			Spec: networkingv1.IngressSpec{
				Rules: []networkingv1.IngressRule{{Host: "example.com"}},
			},
		},
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{Name: "ing-2", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListIngresses(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "ing-1", items[0].Name)
	assert.Equal(t, "example.com", items[0].Hosts)
}

func TestListEvents_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Event{
			ObjectMeta: metav1.ObjectMeta{Name: "evt-1", Namespace: "default"},
			Reason:     "BackOff",
			Message:    "Back-off restarting failed container",
			Type:       "Warning",
			Count:      3,
			InvolvedObject: corev1.ObjectReference{
				Kind: "Pod", Name: "api-pod",
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	events, err := client.ListEvents(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, events, 1)
	assert.Equal(t, "Warning", events[0].Type)
	assert.Equal(t, "BackOff", events[0].Reason)
}

func TestListPods_CrashLoopBackOffStatus(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "crash-pod", Namespace: "default"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "app", Image: "busybox"}},
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				ContainerStatuses: []corev1.ContainerStatus{
					{
						Name:         "app",
						Ready:        false,
						RestartCount: 3,
						State: corev1.ContainerState{
							Waiting: &corev1.ContainerStateWaiting{
								Reason:  "CrashLoopBackOff",
								Message: "back-off 1m20s restarting failed container",
							},
						},
					},
				},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	pods, err := client.ListPods(context.Background(), "default")
	require.NoError(t, err)
	require.Len(t, pods, 1)
	assert.Equal(t, "CrashLoopBackOff", pods[0].Status)
}
