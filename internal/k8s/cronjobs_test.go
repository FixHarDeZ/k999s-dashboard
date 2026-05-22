package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListCronJobs_ReturnsInNamespace(t *testing.T) {
	suspend := false
	fakeClient := fake.NewSimpleClientset(
		&batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"},
			Spec: batchv1.CronJobSpec{
				Schedule: "0 * * * *",
				Suspend:  &suspend,
			},
		},
		&batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: "other", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListCronJobs(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "backup", items[0].Name)
	assert.Equal(t, "0 * * * *", items[0].Schedule)
	assert.False(t, items[0].Suspend)
}

func TestListCronJobs_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "cj-1", Namespace: "default"}},
		&batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "cj-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListCronJobs(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
