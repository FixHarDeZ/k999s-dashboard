package k8s

// ContainerInfo holds per-container detail for a pod.
type ContainerInfo struct {
	Name     string `json:"name"`
	Type     string `json:"type"`     // "init", "sidecar", "main"
	Ready    bool   `json:"ready"`
	Restarts int32  `json:"restarts"`
	State    string `json:"state"`    // "running", "waiting", "terminated", "unknown"
	Reason   string `json:"reason"`   // e.g. "CrashLoopBackOff", "OOMKilled"
}

// PodSummary is the API response type for pod list items.
type PodSummary struct {
	Name       string          `json:"name"`
	Namespace  string          `json:"namespace"`
	Status     string          `json:"status"`
	Ready      string          `json:"ready"`
	Restarts   int32           `json:"restarts"`
	Age        string          `json:"age"`
	Node       string          `json:"node"`
	IP         string          `json:"ip"`
	Containers []ContainerInfo `json:"containers"`
}

// DeploymentSummary is the API response type for deployment list items.
type DeploymentSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Ready     string `json:"ready"`
	UpToDate  int32  `json:"upToDate"`
	Available int32  `json:"available"`
	Age       string `json:"age"`
}

// ContextInfo holds kubeconfig context information.
type ContextInfo struct {
	Name    string `json:"name"`
	Current bool   `json:"current"`
	Cluster string `json:"cluster"`
}

type ServiceSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Type      string `json:"type"`
	ClusterIP string `json:"clusterIP"`
	Ports     string `json:"ports"`
	Age       string `json:"age"`
}

type NodeSummary struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	Roles       string `json:"roles"`
	Age         string `json:"age"`
	Version     string `json:"version"`
	Schedulable bool   `json:"schedulable"`
}

type NamespaceSummary struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Age    string `json:"age"`
}

type ConfigMapSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	DataCount int    `json:"dataCount"`
	Age       string `json:"age"`
}

type SecretSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Type      string `json:"type"`
	DataCount int    `json:"dataCount"`
	Age       string `json:"age"`
}

type EventSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Type      string `json:"type"` // Normal | Warning
	Object    string `json:"object"`
	Count     int32  `json:"count"`
	Age       string `json:"age"`
}

type PodMetricsSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	CPU       string `json:"cpu"`
	Memory    string `json:"memory"`
}

type NodeMetricsSummary struct {
	Name   string `json:"name"`
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
}

type StatefulSetSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Ready     string `json:"ready"`
	Age       string `json:"age"`
}

type IngressSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Hosts     string `json:"hosts"`
	Address   string `json:"address"`
	Ports     string `json:"ports"`
	Age       string `json:"age"`
}

type DaemonSetSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Desired   int32  `json:"desired"`
	Current   int32  `json:"current"`
	Ready     int32  `json:"ready"`
	Available int32  `json:"available"`
	Age       string `json:"age"`
}

type JobSummary struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Completions string `json:"completions"`
	Succeeded   int32  `json:"succeeded"`
	Failed      int32  `json:"failed"`
	Status      string `json:"status"`
	Duration    string `json:"duration"`
	Age         string `json:"age"`
}

type CronJobSummary struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Schedule     string `json:"schedule"`
	Suspend      bool   `json:"suspend"`
	Active       int    `json:"active"`
	LastSchedule string `json:"lastSchedule"`
	Age          string `json:"age"`
}

type HPASummary struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	TargetKind      string `json:"targetKind"`
	TargetName      string `json:"targetName"`
	MinReplicas     int32  `json:"minReplicas"`
	MaxReplicas     int32  `json:"maxReplicas"`
	CurrentReplicas int32  `json:"currentReplicas"`
	Age             string `json:"age"`
}
