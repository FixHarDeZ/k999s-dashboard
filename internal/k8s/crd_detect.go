package k8s

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// CRDPresence indicates which optional CRDs are installed.
type CRDPresence struct {
	Istio         bool `json:"istio"`
	GatewayAPI    bool `json:"gatewayApi"`
	FlaggerCanary bool `json:"flaggerCanary"`
	ArgoRollouts  bool `json:"argoRollouts"`
}

func detectFromGroups(groups []metav1.APIGroup) *CRDPresence {
	p := &CRDPresence{}
	istioGroups := map[string]bool{
		"networking.istio.io": true,
		"security.istio.io":   true,
	}
	gatewayGroups := map[string]bool{
		"gateway.networking.k8s.io": true,
	}
	flaggerGroups := map[string]bool{
		"flagger.app": true,
	}
	argoGroups := map[string]bool{
		"argoproj.io": true,
	}
	for _, g := range groups {
		gv, _ := schema.ParseGroupVersion(g.PreferredVersion.GroupVersion)
		switch {
		case istioGroups[gv.Group]:
			p.Istio = true
		case gatewayGroups[gv.Group]:
			p.GatewayAPI = true
		case flaggerGroups[gv.Group]:
			p.FlaggerCanary = true
		case argoGroups[gv.Group]:
			p.ArgoRollouts = true
		}
	}
	return p
}

// DetectCRDs probes the cluster's API groups for known optional CRDs.
func (c *Client) DetectCRDs() *CRDPresence {
	groups, err := c.kube.Discovery().ServerGroups()
	if err != nil {
		return &CRDPresence{}
	}
	return detectFromGroups(groups.Groups)
}
