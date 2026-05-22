package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListHPAs_ReturnsInNamespace(t *testing.T) {
	minRep := int32(2)
	fakeClient := fake.NewSimpleClientset(
		&autoscalingv2.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "my-hpa", Namespace: "default"},
			Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
				MinReplicas: &minRep,
				MaxReplicas: 10,
				ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
					Kind: "Deployment",
					Name: "my-app",
				},
			},
			Status: autoscalingv2.HorizontalPodAutoscalerStatus{CurrentReplicas: 3},
		},
		&autoscalingv2.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "other-hpa", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListHPAs(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "my-hpa", items[0].Name)
	assert.Equal(t, int32(2), items[0].MinReplicas)
	assert.Equal(t, int32(10), items[0].MaxReplicas)
	assert.Equal(t, "Deployment", items[0].TargetKind)
}

func TestListHPAs_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&autoscalingv2.HorizontalPodAutoscaler{ObjectMeta: metav1.ObjectMeta{Name: "hpa-1", Namespace: "default"}},
		&autoscalingv2.HorizontalPodAutoscaler{ObjectMeta: metav1.ObjectMeta{Name: "hpa-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListHPAs(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
