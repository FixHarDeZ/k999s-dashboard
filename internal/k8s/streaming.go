package k8s

import (
	"context"
	"fmt"
	"io"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/remotecommand"
)

// StreamLogs returns a ReadCloser that streams pod logs. Caller must close it.
// tailLines=0 means stream all logs; tailLines>0 returns last N lines before streaming new ones.
func (c *Client) StreamLogs(ctx context.Context, namespace, name, container string, follow, previous bool, tailLines int64) (io.ReadCloser, error) {
	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		Previous:  previous,
	}
	if tailLines > 0 {
		opts.TailLines = &tailLines
	}
	req := c.kube.CoreV1().Pods(namespace).GetLogs(name, opts)
	return req.Stream(ctx)
}

// ExecPod opens an interactive shell in the pod. Returns error if restConfig is nil (test clients).
func (c *Client) ExecPod(ctx context.Context, namespace, name, container string, cmd []string, stdin io.Reader, stdout, stderr io.Writer) error {
	if c.restConfig == nil {
		return fmt.Errorf("exec not available: no REST config (test client)")
	}
	req := c.kube.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(name).
		Namespace(namespace).
		SubResource("exec").
		Param("container", container).
		Param("stdin", "true").
		Param("stdout", "true").
		Param("stderr", "true").
		Param("tty", "true")
	for _, arg := range cmd {
		req = req.Param("command", arg)
	}
	exec, err := remotecommand.NewSPDYExecutor(c.restConfig, "POST", req.URL())
	if err != nil {
		return fmt.Errorf("create executor: %w", err)
	}
	return exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		Tty:    true,
	})
}

// ContainersForPod returns the container names of a pod.
func (c *Client) ContainersForPod(ctx context.Context, namespace, name string) ([]string, error) {
	pod, err := c.kube.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(pod.Spec.Containers))
	for _, ctr := range pod.Spec.Containers {
		names = append(names, ctr.Name)
	}
	return names, nil
}
