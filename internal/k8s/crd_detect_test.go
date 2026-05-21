package k8s

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestDetectFromGroups(t *testing.T) {
	cases := []struct {
		name   string
		groups []metav1.APIGroup
		want   CRDPresence
	}{
		{
			name:   "empty",
			groups: []metav1.APIGroup{},
			want:   CRDPresence{},
		},
		{
			name: "istio only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "networking.istio.io/v1beta1"}},
			},
			want: CRDPresence{Istio: true},
		},
		{
			name: "gateway api only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "gateway.networking.k8s.io/v1"}},
			},
			want: CRDPresence{GatewayAPI: true},
		},
		{
			name: "flagger only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "flagger.app/v1beta1"}},
			},
			want: CRDPresence{FlaggerCanary: true},
		},
		{
			name: "argo only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "argoproj.io/v1alpha1"}},
			},
			want: CRDPresence{ArgoRollouts: true},
		},
		{
			name: "both canary types",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "flagger.app/v1beta1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "argoproj.io/v1alpha1"}},
			},
			want: CRDPresence{FlaggerCanary: true, ArgoRollouts: true},
		},
		{
			name: "all CRDs",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "networking.istio.io/v1beta1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "gateway.networking.k8s.io/v1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "flagger.app/v1beta1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "argoproj.io/v1alpha1"}},
			},
			want: CRDPresence{Istio: true, GatewayAPI: true, FlaggerCanary: true, ArgoRollouts: true},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := detectFromGroups(tc.groups)
			if *got != tc.want {
				t.Errorf("got %+v, want %+v", *got, tc.want)
			}
		})
	}
}
