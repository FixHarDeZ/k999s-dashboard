package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes/fake"
)

func TestResolveServiceToPod_FindsRunningPod(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "my-svc", Namespace: "default"},
			Spec: corev1.ServiceSpec{
				Selector: map[string]string{"app": "my-app"},
				Ports: []corev1.ServicePort{
					{Port: 80, TargetPort: intstr.FromInt(8080)},
				},
			},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-pod",
				Namespace: "default",
				Labels:    map[string]string{"app": "my-app"},
			},
			Status: corev1.PodStatus{Phase: corev1.PodRunning},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	podName, targetPort, err := client.ResolveServiceToPod(context.Background(), "default", "my-svc")
	require.NoError(t, err)
	assert.Equal(t, "my-pod", podName)
	assert.Equal(t, 8080, targetPort)
}

func TestResolveServiceToPod_NoRunningPods(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "my-svc", Namespace: "default"},
			Spec: corev1.ServiceSpec{
				Selector: map[string]string{"app": "my-app"},
				Ports:    []corev1.ServicePort{{Port: 80, TargetPort: intstr.FromInt(8080)}},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	_, _, err := client.ResolveServiceToPod(context.Background(), "default", "my-svc")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no running pods")
}
