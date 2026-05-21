package diagnostic

import (
	"context"
	"fmt"
	"strings"
)

// Provider streams AI analysis tokens of a failing pod.
type Provider interface {
	Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error)
}

// DiagnosticInput holds the pod context for analysis.
type DiagnosticInput struct {
	PodName      string
	Namespace    string
	PodDetails   string // container states, exit codes, resource limits
	CurrentLogs  string // current run logs
	PreviousLogs string // previous run logs (before last crash)
	Events       string // k8s events for this pod
}

const systemPrompt = `You are a Kubernetes SRE expert with direct access to real cluster data about a failing pod.
You have been given actual container states, exit codes, termination messages, resource limits, logs, and events.

CRITICAL RULES:
- Analyze ONLY from the data provided. Do NOT say "run kubectl describe" or suggest commands to gather more info — you already have the data.
- Be specific: cite actual exit codes, error messages, log lines, or event messages in your diagnosis.
- If logs are empty but container state shows Waiting/Terminated with a reason, diagnose from that reason directly.
- Provide concrete fix steps that resolve the actual observed issue, not generic advice.

Format your response with these sections:
🔍 Root Cause: (1-3 sentences — cite specific data: exit code, reason, log line, or event)
🔧 Fix Steps: (3-5 numbered steps — concrete actions, not "check if X")
⚠️ Key Observations: (bullet list of notable findings from the data: exit codes, OOM signals, image issues, etc.)`

func buildPrompt(input DiagnosticInput) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Pod: %s/%s\n\n", input.Namespace, input.PodName)

	if input.PodDetails != "" {
		fmt.Fprintf(&sb, "%s\n", input.PodDetails)
	}
	if input.Events != "" {
		fmt.Fprintf(&sb, "=== Kubernetes Events ===\n%s\n\n", input.Events)
	}
	if input.PreviousLogs != "" {
		fmt.Fprintf(&sb, "=== Previous Run Logs (before last crash) ===\n%s\n\n", input.PreviousLogs)
	}
	if input.CurrentLogs != "" {
		fmt.Fprintf(&sb, "=== Current Logs ===\n%s\n\n", input.CurrentLogs)
	}
	if input.CurrentLogs == "" && input.PreviousLogs == "" {
		sb.WriteString("Note: No logs available — container may not have started or logs were lost.\n\n")
	}

	sb.WriteString("Based on all the data above, diagnose the exact root cause and provide concrete fix steps.")
	return sb.String()
}
