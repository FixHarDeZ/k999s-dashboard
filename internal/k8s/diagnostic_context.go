package k8s

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// PodDiagnosticContext holds rich pod state data for AI analysis.
type PodDiagnosticContext struct {
	PodDetails   string // structured pod status, container states, resource limits
	CurrentLogs  string // current container logs (may be empty if crashed)
	PreviousLogs string // previous run logs for restarted containers
	Events       string // warning events for this pod
}

// GetPodDiagnosticContext collects all available diagnostic data for a pod.
func (c *Client) GetPodDiagnosticContext(ctx context.Context, namespace, name string) (*PodDiagnosticContext, error) {
	pod, err := c.kube.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("get pod: %w", err)
	}

	var details strings.Builder

	// ── Phase & top-level status ──────────────────────────────────────────────
	fmt.Fprintf(&details, "=== Pod Status ===\n")
	fmt.Fprintf(&details, "Phase:  %s\n", pod.Status.Phase)
	fmt.Fprintf(&details, "PodIP:  %s\n", pod.Status.PodIP)
	fmt.Fprintf(&details, "Node:   %s\n", pod.Spec.NodeName)
	if pod.Status.Reason != "" {
		fmt.Fprintf(&details, "Reason: %s\n", pod.Status.Reason)
	}
	if pod.Status.Message != "" {
		fmt.Fprintf(&details, "Message: %s\n", pod.Status.Message)
	}

	// Failed conditions
	for _, cond := range pod.Status.Conditions {
		if cond.Status != corev1.ConditionTrue {
			fmt.Fprintf(&details, "Condition %s=False  reason=%s  msg=%s\n",
				cond.Type, cond.Reason, cond.Message)
		}
	}

	// ── Init container statuses ───────────────────────────────────────────────
	if len(pod.Status.InitContainerStatuses) > 0 {
		fmt.Fprintf(&details, "\n=== Init Containers ===\n")
		initSpecMap := map[string]corev1.Container{}
		for _, c := range pod.Spec.InitContainers {
			initSpecMap[c.Name] = c
		}
		for _, cs := range pod.Status.InitContainerStatuses {
			spec := initSpecMap[cs.Name]
			fmt.Fprintf(&details, "[init: %s]  image=%s  ready=%v  restarts=%d\n",
				cs.Name, spec.Image, cs.Ready, cs.RestartCount)
			writeContainerState(&details, "current", cs.State)
			if cs.RestartCount > 0 {
				writeContainerState(&details, "last", cs.LastTerminationState)
			}
		}
	}

	// ── Container statuses ────────────────────────────────────────────────────
	fmt.Fprintf(&details, "\n=== Containers ===\n")
	specMap := map[string]corev1.Container{}
	for _, c := range pod.Spec.Containers {
		specMap[c.Name] = c
	}
	for _, cs := range pod.Status.ContainerStatuses {
		spec := specMap[cs.Name]
		fmt.Fprintf(&details, "[container: %s]  image=%s  ready=%v  restarts=%d\n",
			cs.Name, spec.Image, cs.Ready, cs.RestartCount)
		writeContainerState(&details, "current", cs.State)
		if cs.RestartCount > 0 {
			writeContainerState(&details, "last", cs.LastTerminationState)
		}
		// Resource limits
		if req := spec.Resources.Requests; req != nil {
			if cpu := req.Cpu(); cpu != nil && !cpu.IsZero() {
				fmt.Fprintf(&details, "  request cpu=%s", cpu.String())
			}
			if mem := req.Memory(); mem != nil && !mem.IsZero() {
				fmt.Fprintf(&details, " memory=%s\n", mem.String())
			}
		}
		if lim := spec.Resources.Limits; lim != nil {
			if cpu := lim.Cpu(); cpu != nil && !cpu.IsZero() {
				fmt.Fprintf(&details, "  limit   cpu=%s", cpu.String())
			}
			if mem := lim.Memory(); mem != nil && !mem.IsZero() {
				fmt.Fprintf(&details, " memory=%s\n", mem.String())
			}
		}
		// Env vars (names only — redact values)
		if len(spec.Env) > 0 {
			var envNames []string
			for _, e := range spec.Env {
				envNames = append(envNames, e.Name)
			}
			fmt.Fprintf(&details, "  envVars: %s\n", strings.Join(envNames, ", "))
		}
	}

	// ── Collect logs ──────────────────────────────────────────────────────────
	var currentLogParts []string
	var previousLogParts []string

	for _, cs := range pod.Status.ContainerStatuses {
		// Current logs
		cur := collectLogs(ctx, c, namespace, name, cs.Name, false, 150)
		if cur != "" {
			currentLogParts = append(currentLogParts, fmt.Sprintf("--- container: %s ---\n%s", cs.Name, cur))
		}
		// Previous logs (only if container has restarted)
		if cs.RestartCount > 0 {
			prev := collectLogs(ctx, c, namespace, name, cs.Name, true, 100)
			if prev != "" {
				previousLogParts = append(previousLogParts, fmt.Sprintf("--- container: %s (previous run) ---\n%s", cs.Name, prev))
			}
		}
	}

	// ── Events (Warning only, for this pod) ───────────────────────────────────
	evtList, _ := c.kube.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s,involvedObject.namespace=%s", name, namespace),
	})
	var eventLines []string
	if evtList != nil {
		for _, e := range evtList.Items {
			age := time.Since(e.LastTimestamp.Time).Round(time.Second)
			eventLines = append(eventLines, fmt.Sprintf("[%s] %s: %s  (count=%d, age=%s)",
				e.Type, e.Reason, e.Message, e.Count, age))
		}
	}

	return &PodDiagnosticContext{
		PodDetails:   details.String(),
		CurrentLogs:  strings.Join(currentLogParts, "\n"),
		PreviousLogs: strings.Join(previousLogParts, "\n"),
		Events:       strings.Join(eventLines, "\n"),
	}, nil
}

func writeContainerState(sb *strings.Builder, label string, state corev1.ContainerState) {
	if state.Running != nil {
		fmt.Fprintf(sb, "  %s state: Running  started=%s\n", label,
			state.Running.StartedAt.Format(time.RFC3339))
	} else if state.Waiting != nil {
		fmt.Fprintf(sb, "  %s state: Waiting  reason=%s  msg=%s\n", label,
			state.Waiting.Reason, state.Waiting.Message)
	} else if state.Terminated != nil {
		fmt.Fprintf(sb, "  %s state: Terminated  exitCode=%d  reason=%s  msg=%s  finished=%s\n",
			label,
			state.Terminated.ExitCode,
			state.Terminated.Reason,
			state.Terminated.Message,
			state.Terminated.FinishedAt.Format(time.RFC3339))
	}
}

func collectLogs(ctx context.Context, c *Client, namespace, pod, container string, previous bool, maxLines int) string {
	stream, err := c.StreamLogs(ctx, namespace, pod, container, false, previous)
	if err != nil || stream == nil {
		return ""
	}
	defer stream.Close()

	var lines []string
	scanner := bufio.NewScanner(io.LimitReader(stream, 512*1024)) // 512 KB cap
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	return strings.Join(lines, "\n")
}
