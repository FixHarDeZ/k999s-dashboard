package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListStatefulSets_ReturnsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.StatefulSet{
			ObjectMeta: metav1.ObjectMeta{Name: "sts-1", Namespace: "default"},
			Status:     appsv1.StatefulSetStatus{ReadyReplicas: 2, Replicas: 3},
		},
		&appsv1.StatefulSet{
			ObjectMeta: metav1.ObjectMeta{Name: "sts-2", Namespace: "other"},
			Status:     appsv1.StatefulSetStatus{ReadyReplicas: 1, Replicas: 1},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListStatefulSets(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "sts-1", items[0].Name)
	assert.Equal(t, "default", items[0].Namespace)
	assert.Equal(t, "2/3", items[0].Ready)
}

func TestListStatefulSets_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "sts-1", Namespace: "default"}},
		&appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "sts-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListStatefulSets(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
