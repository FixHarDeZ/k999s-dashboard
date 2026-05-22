package k8s

import (
	"context"
	"fmt"
	"io"
	"net/http"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

// StartPortForward binds localhost:localPort → pod:remotePort using client-go SPDY.
// Blocks until stopCh is closed or an error occurs. Signals readyCh when tunnel is up.
// Returns error if restConfig is nil (test clients).
func (c *Client) StartPortForward(
	ctx context.Context,
	namespace, podName string,
	localPort, remotePort int,
	stopCh <-chan struct{},
	readyCh chan struct{},
) error {
	if c.restConfig == nil {
		return fmt.Errorf("port-forward not available: no REST config (test client)")
	}
	url := c.kube.CoreV1().RESTClient().Post().
		Resource("pods").
		Namespace(namespace).
		Name(podName).
		SubResource("portforward").
		URL()

	transport, upgrader, err := spdy.RoundTripperFor(c.restConfig)
	if err != nil {
		return fmt.Errorf("create spdy transport: %w", err)
	}
	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, url)

	fw, err := portforward.New(
		dialer,
		[]string{fmt.Sprintf("%d:%d", localPort, remotePort)},
		stopCh,
		readyCh,
		io.Discard,
		io.Discard,
	)
	if err != nil {
		return fmt.Errorf("create port forwarder: %w", err)
	}
	return fw.ForwardPorts()
}

// ResolveServiceToPod finds a running pod backing the given service and returns
// the pod name and the service's first targetPort as an integer.
func (c *Client) ResolveServiceToPod(ctx context.Context, namespace, serviceName string) (podName string, targetPort int, err error) {
	svc, err := c.kube.CoreV1().Services(namespace).Get(ctx, serviceName, metav1.GetOptions{})
	if err != nil {
		return "", 0, fmt.Errorf("get service: %w", err)
	}
	if len(svc.Spec.Ports) == 0 {
		return "", 0, fmt.Errorf("service %s has no ports", serviceName)
	}
	tp := svc.Spec.Ports[0].TargetPort
	if tp.IntValue() != 0 {
		targetPort = tp.IntValue()
	} else {
		targetPort = int(svc.Spec.Ports[0].Port)
	}

	selector := labels.Set(svc.Spec.Selector).String()
	pods, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		return "", 0, fmt.Errorf("list pods: %w", err)
	}
	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodRunning {
			return pod.Name, targetPort, nil
		}
	}
	return "", 0, fmt.Errorf("no running pods found for service %s", serviceName)
}
