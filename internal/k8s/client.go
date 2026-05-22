package k8s

import (
	"context"
	"fmt"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Client wraps the Kubernetes clientset with domain-specific methods.
type Client struct {
	kube           kubernetes.Interface
	restConfig     *rest.Config // needed for exec; nil in test clients
	currentContext string
	kubeconfigPath string
}

// NewClient creates a real client from kubeconfig file.
func NewClient(kubeconfigPath, context string) (*Client, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loadingRules.ExplicitPath = kubeconfigPath
	}
	configOverrides := &clientcmd.ConfigOverrides{}
	if context != "" {
		configOverrides.CurrentContext = context
	}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)
	restConfig, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}
	rawConfig, _ := kubeConfig.RawConfig()
	return &Client{
		kube:           clientset,
		restConfig:     restConfig,
		currentContext: rawConfig.CurrentContext,
		kubeconfigPath: kubeconfigPath,
	}, nil
}

// NewClientFromKubernetesClient creates a client from an existing kubernetes.Interface (for testing).
func NewClientFromKubernetesClient(kube kubernetes.Interface, context string) *Client {
	return &Client{kube: kube, currentContext: context}
}

// SwitchContext reinitialises the client for a different kubeconfig context.
// This is safe for single-user local use (no mutex needed).
func (c *Client) SwitchContext(contextName string) error {
	next, err := NewClient(c.kubeconfigPath, contextName)
	if err != nil {
		return fmt.Errorf("switch context %q: %w", contextName, err)
	}
	c.kube = next.kube
	c.restConfig = next.restConfig
	c.currentContext = next.currentContext
	return nil
}

// ListPods returns pod summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListPods(ctx context.Context, namespace string) ([]PodSummary, error) {
	list, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]PodSummary, 0, len(list.Items))
	for _, p := range list.Items {
		summaries = append(summaries, toPodSummary(p))
	}
	return summaries, nil
}

// ListNamespaces returns the names of all namespaces.
func (c *Client) ListNamespaces(ctx context.Context) ([]string, error) {
	list, err := c.kube.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	return names, nil
}

// ListDeployments returns deployment summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListDeployments(ctx context.Context, namespace string) ([]DeploymentSummary, error) {
	list, err := c.kube.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]DeploymentSummary, 0, len(list.Items))
	for _, d := range list.Items {
		summaries = append(summaries, toDeploymentSummary(d))
	}
	return summaries, nil
}

// ListStatefulSets returns statefulset summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListStatefulSets(ctx context.Context, namespace string) ([]StatefulSetSummary, error) {
	list, err := c.kube.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]StatefulSetSummary, 0, len(list.Items))
	for _, s := range list.Items {
		summaries = append(summaries, toStatefulSetSummary(s))
	}
	return summaries, nil
}

func toStatefulSetSummary(s appsv1.StatefulSet) StatefulSetSummary {
	return StatefulSetSummary{
		Name:      s.Name,
		Namespace: s.Namespace,
		Ready:     fmt.Sprintf("%d/%d", s.Status.ReadyReplicas, s.Status.Replicas),
		Age:       formatAge(s.CreationTimestamp.Time),
	}
}

// ListDaemonSets returns daemonset summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListDaemonSets(ctx context.Context, namespace string) ([]DaemonSetSummary, error) {
	list, err := c.kube.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]DaemonSetSummary, 0, len(list.Items))
	for _, d := range list.Items {
		summaries = append(summaries, toDaemonSetSummary(d))
	}
	return summaries, nil
}

func toDaemonSetSummary(d appsv1.DaemonSet) DaemonSetSummary {
	return DaemonSetSummary{
		Name:      d.Name,
		Namespace: d.Namespace,
		Desired:   d.Status.DesiredNumberScheduled,
		Current:   d.Status.CurrentNumberScheduled,
		Ready:     d.Status.NumberReady,
		Available: d.Status.NumberAvailable,
		Age:       formatAge(d.CreationTimestamp.Time),
	}
}

// ListJobs returns job summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListJobs(ctx context.Context, namespace string) ([]JobSummary, error) {
	list, err := c.kube.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]JobSummary, 0, len(list.Items))
	for _, j := range list.Items {
		summaries = append(summaries, toJobSummary(j))
	}
	return summaries, nil
}

func toJobSummary(j batchv1.Job) JobSummary {
	completions := fmt.Sprintf("%d/1", j.Status.Succeeded)
	if j.Spec.Completions != nil {
		completions = fmt.Sprintf("%d/%d", j.Status.Succeeded, *j.Spec.Completions)
	}
	return JobSummary{
		Name:        j.Name,
		Namespace:   j.Namespace,
		Completions: completions,
		Succeeded:   j.Status.Succeeded,
		Failed:      j.Status.Failed,
		Status:      jobStatus(j),
		Duration:    jobDuration(j),
		Age:         formatAge(j.CreationTimestamp.Time),
	}
}

func jobStatus(j batchv1.Job) string {
	for _, cond := range j.Status.Conditions {
		if cond.Type == batchv1.JobComplete && cond.Status == corev1.ConditionTrue {
			return "Complete"
		}
		if cond.Type == batchv1.JobFailed && cond.Status == corev1.ConditionTrue {
			return "Failed"
		}
	}
	return "Running"
}

func jobDuration(j batchv1.Job) string {
	if j.Status.StartTime == nil {
		return ""
	}
	end := time.Now()
	if j.Status.CompletionTime != nil {
		end = j.Status.CompletionTime.Time
	}
	d := end.Sub(j.Status.StartTime.Time)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh", int(d.Hours()))
}

// ListCronJobs returns cronjob summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListCronJobs(ctx context.Context, namespace string) ([]CronJobSummary, error) {
	list, err := c.kube.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]CronJobSummary, 0, len(list.Items))
	for _, cj := range list.Items {
		summaries = append(summaries, toCronJobSummary(cj))
	}
	return summaries, nil
}

func toCronJobSummary(cj batchv1.CronJob) CronJobSummary {
	lastSchedule := "Never"
	if cj.Status.LastScheduleTime != nil {
		lastSchedule = formatAge(cj.Status.LastScheduleTime.Time)
	}
	suspend := cj.Spec.Suspend != nil && *cj.Spec.Suspend
	return CronJobSummary{
		Name:         cj.Name,
		Namespace:    cj.Namespace,
		Schedule:     cj.Spec.Schedule,
		Suspend:      suspend,
		Active:       len(cj.Status.Active),
		LastSchedule: lastSchedule,
		Age:          formatAge(cj.CreationTimestamp.Time),
	}
}

// GetContexts returns kubeconfig context information.
func (c *Client) GetContexts() ([]ContextInfo, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if c.kubeconfigPath != "" {
		loadingRules.ExplicitPath = c.kubeconfigPath
	}
	rawConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, &clientcmd.ConfigOverrides{},
	).RawConfig()
	if err != nil {
		return nil, err
	}
	contexts := make([]ContextInfo, 0, len(rawConfig.Contexts))
	for name, ctx := range rawConfig.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:    name,
			Current: name == rawConfig.CurrentContext,
			Cluster: ctx.Cluster,
		})
	}
	return contexts, nil
}

// containerStateInfo extracts the state name and reason from a ContainerState.
func containerStateInfo(s corev1.ContainerState) (state, reason string) {
	if s.Running != nil {
		return "running", ""
	}
	if s.Waiting != nil {
		return "waiting", s.Waiting.Reason
	}
	if s.Terminated != nil {
		return "terminated", s.Terminated.Reason
	}
	return "unknown", ""
}

func toPodSummary(p corev1.Pod) PodSummary {
	readyCount := 0
	totalCount := len(p.Spec.Containers)
	var restarts int32
	for _, cs := range p.Status.ContainerStatuses {
		if cs.Ready {
			readyCount++
		}
		restarts += cs.RestartCount
	}

	// Build a lookup map from container name → status for init containers.
	initStatusByName := make(map[string]corev1.ContainerStatus, len(p.Status.InitContainerStatuses))
	for _, cs := range p.Status.InitContainerStatuses {
		initStatusByName[cs.Name] = cs
	}
	// And for regular containers.
	mainStatusByName := make(map[string]corev1.ContainerStatus, len(p.Status.ContainerStatuses))
	for _, cs := range p.Status.ContainerStatuses {
		mainStatusByName[cs.Name] = cs
	}

	var containers []ContainerInfo

	// Init containers (and sidecar containers, identified by RestartPolicy == "Always").
	for _, c := range p.Spec.InitContainers {
		ctype := "init"
		if c.RestartPolicy != nil && string(*c.RestartPolicy) == "Always" {
			ctype = "sidecar"
		}
		var ready bool
		var restartCount int32
		state, reason := "unknown", ""
		if cs, ok := initStatusByName[c.Name]; ok {
			ready = cs.Ready
			restartCount = cs.RestartCount
			state, reason = containerStateInfo(cs.State)
		}
		containers = append(containers, ContainerInfo{
			Name:     c.Name,
			Type:     ctype,
			Ready:    ready,
			Restarts: restartCount,
			State:    state,
			Reason:   reason,
		})
	}

	// Main containers.
	for _, c := range p.Spec.Containers {
		var ready bool
		var restartCount int32
		state, reason := "unknown", ""
		if cs, ok := mainStatusByName[c.Name]; ok {
			ready = cs.Ready
			restartCount = cs.RestartCount
			state, reason = containerStateInfo(cs.State)
		}
		containers = append(containers, ContainerInfo{
			Name:     c.Name,
			Type:     "main",
			Ready:    ready,
			Restarts: restartCount,
			State:    state,
			Reason:   reason,
		})
	}

	return PodSummary{
		Name:       p.Name,
		Namespace:  p.Namespace,
		Status:     string(p.Status.Phase),
		Ready:      fmt.Sprintf("%d/%d", readyCount, totalCount),
		Restarts:   restarts,
		Age:        formatAge(p.CreationTimestamp.Time),
		Node:       p.Spec.NodeName,
		IP:         p.Status.PodIP,
		Containers: containers,
	}
}

func toDeploymentSummary(d appsv1.Deployment) DeploymentSummary {
	return DeploymentSummary{
		Name:      d.Name,
		Namespace: d.Namespace,
		Ready:     fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, d.Status.Replicas),
		UpToDate:  d.Status.UpdatedReplicas,
		Available: d.Status.AvailableReplicas,
		Age:       formatAge(d.CreationTimestamp.Time),
	}
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}

func (c *Client) ListServices(ctx context.Context, namespace string) ([]ServiceSummary, error) {
	list, err := c.kube.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]ServiceSummary, 0, len(list.Items))
	for _, s := range list.Items {
		ports := make([]string, 0, len(s.Spec.Ports))
		for _, p := range s.Spec.Ports {
			ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}
		out = append(out, ServiceSummary{
			Name:      s.Name,
			Namespace: s.Namespace,
			Type:      string(s.Spec.Type),
			ClusterIP: s.Spec.ClusterIP,
			Ports:     strings.Join(ports, ", "),
			Age:       formatAge(s.CreationTimestamp.Time),
		})
	}
	return out, nil
}

// ListIngresses returns ingress summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListIngresses(ctx context.Context, namespace string) ([]IngressSummary, error) {
	list, err := c.kube.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]IngressSummary, 0, len(list.Items))
	for _, ing := range list.Items {
		summaries = append(summaries, toIngressSummary(ing))
	}
	return summaries, nil
}

func toIngressSummary(ing networkingv1.Ingress) IngressSummary {
	var hosts []string
	for _, rule := range ing.Spec.Rules {
		if rule.Host != "" {
			hosts = append(hosts, rule.Host)
		}
	}
	var addrs []string
	for _, lb := range ing.Status.LoadBalancer.Ingress {
		if lb.IP != "" {
			addrs = append(addrs, lb.IP)
		} else if lb.Hostname != "" {
			addrs = append(addrs, lb.Hostname)
		}
	}
	ports := "80"
	if len(ing.Spec.TLS) > 0 {
		ports = "80, 443"
	}
	return IngressSummary{
		Name:      ing.Name,
		Namespace: ing.Namespace,
		Hosts:     strings.Join(hosts, ", "),
		Address:   strings.Join(addrs, ", "),
		Ports:     ports,
		Age:       formatAge(ing.CreationTimestamp.Time),
	}
}

func (c *Client) ListNodes(ctx context.Context) ([]NodeSummary, error) {
	list, err := c.kube.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]NodeSummary, 0, len(list.Items))
	for _, n := range list.Items {
		status := "NotReady"
		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
				status = "Ready"
			}
		}
		roles := []string{}
		for k := range n.Labels {
			if strings.HasPrefix(k, "node-role.kubernetes.io/") {
				roles = append(roles, strings.TrimPrefix(k, "node-role.kubernetes.io/"))
			}
		}
		rolesStr := strings.Join(roles, ",")
		if rolesStr == "" {
			rolesStr = "<none>"
		}
		out = append(out, NodeSummary{
			Name:        n.Name,
			Status:      status,
			Roles:       rolesStr,
			Age:         formatAge(n.CreationTimestamp.Time),
			Version:     n.Status.NodeInfo.KubeletVersion,
			Schedulable: !n.Spec.Unschedulable,
		})
	}
	return out, nil
}

func (c *Client) ListNamespaceSummaries(ctx context.Context) ([]NamespaceSummary, error) {
	list, err := c.kube.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]NamespaceSummary, 0, len(list.Items))
	for _, n := range list.Items {
		out = append(out, NamespaceSummary{
			Name:   n.Name,
			Status: string(n.Status.Phase),
			Age:    formatAge(n.CreationTimestamp.Time),
		})
	}
	return out, nil
}

func (c *Client) ListConfigMaps(ctx context.Context, namespace string) ([]ConfigMapSummary, error) {
	list, err := c.kube.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]ConfigMapSummary, 0, len(list.Items))
	for _, cm := range list.Items {
		out = append(out, ConfigMapSummary{
			Name:      cm.Name,
			Namespace: cm.Namespace,
			DataCount: len(cm.Data),
			Age:       formatAge(cm.CreationTimestamp.Time),
		})
	}
	return out, nil
}

func (c *Client) ListSecrets(ctx context.Context, namespace string) ([]SecretSummary, error) {
	list, err := c.kube.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]SecretSummary, 0, len(list.Items))
	for _, s := range list.Items {
		out = append(out, SecretSummary{
			Name:      s.Name,
			Namespace: s.Namespace,
			Type:      string(s.Type),
			DataCount: len(s.Data),
			Age:       formatAge(s.CreationTimestamp.Time),
		})
	}
	return out, nil
}
