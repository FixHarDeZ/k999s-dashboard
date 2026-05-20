package k8s

import "k8s.io/apimachinery/pkg/runtime/schema"

// CRDPresence indicates which optional CRDs are installed.
type CRDPresence struct {
	Istio      bool `json:"istio"`
	GatewayAPI bool `json:"gatewayApi"`
	Canary     bool `json:"canary"`
}

// DetectCRDs probes the cluster's API groups for known optional CRDs.
func (c *Client) DetectCRDs() *CRDPresence {
	p := &CRDPresence{}
	groups, err := c.kube.Discovery().ServerGroups()
	if err != nil {
		return p
	}
	istioGroups := map[string]bool{
		"networking.istio.io": true,
		"security.istio.io":   true,
	}
	gatewayGroups := map[string]bool{
		"gateway.networking.k8s.io": true,
	}
	canaryGroups := map[string]bool{
		"flagger.app": true,
		"argoproj.io": true,
	}
	for _, g := range groups.Groups {
		gv, _ := schema.ParseGroupVersion(g.PreferredVersion.GroupVersion)
		switch {
		case istioGroups[gv.Group]:
			p.Istio = true
		case gatewayGroups[gv.Group]:
			p.GatewayAPI = true
		case canaryGroups[gv.Group]:
			p.Canary = true
		}
	}
	return p
}
