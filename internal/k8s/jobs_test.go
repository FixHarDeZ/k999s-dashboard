package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListJobs_ReturnsInNamespace(t *testing.T) {
	completions := int32(1)
	fakeClient := fake.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"},
			Spec:       batchv1.JobSpec{Completions: &completions},
			Status: batchv1.JobStatus{
				Succeeded: 1,
				Conditions: []batchv1.JobCondition{
					{Type: batchv1.JobComplete, Status: corev1.ConditionTrue},
				},
			},
		},
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "other-job", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListJobs(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "backup", items[0].Name)
	assert.Equal(t, "1/1", items[0].Completions)
	assert.Equal(t, "Complete", items[0].Status)
}

func TestListJobs_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.Job{ObjectMeta: metav1.ObjectMeta{Name: "job-1", Namespace: "default"}},
		&batchv1.Job{ObjectMeta: metav1.ObjectMeta{Name: "job-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListJobs(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
