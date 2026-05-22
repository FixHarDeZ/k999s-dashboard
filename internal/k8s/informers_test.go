package k8s_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

type mockHub struct {
	mu    sync.Mutex
	calls map[string]int
}

func (m *mockHub) Broadcast(msgType string, _ any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.calls == nil {
		m.calls = make(map[string]int)
	}
	m.calls[msgType]++
}

func (m *mockHub) count(msgType string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls[msgType]
}

func TestStartInformers_BroadcastsPodsUpdate(t *testing.T) {
	hub := &mockHub{}
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"}},
	)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	k8s.StartInformers(ctx, fakeClient, hub)
	time.Sleep(300 * time.Millisecond)

	assert.Greater(t, hub.count("pods_update"), 0, "expected pods_update broadcast")
}

func TestStartInformers_BroadcastsEventsUpdate(t *testing.T) {
	hub := &mockHub{}
	fakeClient := fake.NewSimpleClientset(
		&corev1.Event{ObjectMeta: metav1.ObjectMeta{Name: "ev-1", Namespace: "default"}},
	)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	k8s.StartInformers(ctx, fakeClient, hub)
	time.Sleep(300 * time.Millisecond)

	assert.Greater(t, hub.count("events_update"), 0, "expected events_update broadcast")
}
