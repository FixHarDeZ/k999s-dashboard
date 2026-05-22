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

func TestListDaemonSets_ReturnsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{
			ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"},
			Status: appsv1.DaemonSetStatus{
				DesiredNumberScheduled: 3,
				CurrentNumberScheduled: 3,
				NumberReady:            2,
				NumberAvailable:        2,
			},
		},
		&appsv1.DaemonSet{
			ObjectMeta: metav1.ObjectMeta{Name: "ds-2", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListDaemonSets(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "ds-1", items[0].Name)
	assert.Equal(t, int32(3), items[0].Desired)
	assert.Equal(t, int32(2), items[0].Ready)
}

func TestListDaemonSets_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"}},
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListDaemonSets(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
