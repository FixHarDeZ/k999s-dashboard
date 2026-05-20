package k8s

// PodSummary is the API response type for pod list items.
type PodSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
	Ready     string `json:"ready"`
	Restarts  int32  `json:"restarts"`
	Age       string `json:"age"`
	Node      string `json:"node"`
	IP        string `json:"ip"`
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
