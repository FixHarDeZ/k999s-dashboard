package k8s

import (
	"context"
	"time"

	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// BroadcastHub is satisfied by *ws.Hub — defined here to avoid import cycle.
type BroadcastHub interface {
	Broadcast(msgType string, data any)
}

// StartInformers starts pod and event informers that broadcast to hub on any change.
// Returns immediately; informers run as goroutines until ctx is cancelled.
func StartInformers(ctx context.Context, kube kubernetes.Interface, hub BroadcastHub) {
	factory := informers.NewSharedInformerFactory(kube, 0*time.Second)

	podInformer := factory.Core().V1().Pods().Informer()
	podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(_ any) { hub.Broadcast("pods_update", nil) },
		UpdateFunc: func(_, _ any) { hub.Broadcast("pods_update", nil) },
		DeleteFunc: func(_ any) { hub.Broadcast("pods_update", nil) },
	})

	eventInformer := factory.Core().V1().Events().Informer()
	eventInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(_ any) { hub.Broadcast("events_update", nil) },
		UpdateFunc: func(_, _ any) { hub.Broadcast("events_update", nil) },
		DeleteFunc: func(_ any) { hub.Broadcast("events_update", nil) },
	})

	factory.Start(ctx.Done())
}
