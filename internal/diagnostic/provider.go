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
	PodName   string
	Namespace string
	Logs      string
	Events    string
}

const systemPrompt = `You are a Kubernetes SRE expert. Analyze the failing pod and provide a concise diagnosis.
Format your response with exactly these sections:
🔍 Root Cause: (1-2 sentences)
🔧 Fix Steps: (2-3 numbered steps)
Keep it brief and actionable.`

func buildPrompt(input DiagnosticInput) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Pod: %s/%s\n\n", input.Namespace, input.PodName)
	if input.Logs != "" {
		fmt.Fprintf(&sb, "=== Recent Logs ===\n%s\n\n", input.Logs)
	}
	if input.Events != "" {
		fmt.Fprintf(&sb, "=== Events ===\n%s\n\n", input.Events)
	}
	sb.WriteString("Diagnose this pod and suggest how to fix it.")
	return sb.String()
}
