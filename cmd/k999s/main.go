package main

import (
	"flag"
	"fmt"
	"log"
	"os/exec"
	"runtime"

	"github.com/k999s/dashboard/internal/api"
	"github.com/k999s/dashboard/internal/config"
	"github.com/k999s/dashboard/internal/frontend"
	"github.com/k999s/dashboard/internal/k8s"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	kubeconfig := flag.String("kubeconfig", "", "Path to kubeconfig (default: ~/.kube/config)")
	flag.Parse()

	cfg, err := config.Load(*kubeconfig)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	k8sClient, err := k8s.NewClient(cfg.KubeconfigPath, cfg.CurrentContext)
	if err != nil {
		log.Fatalf("failed to create k8s client: %v", err)
	}

	router := api.NewRouter(k8sClient, frontend.FS)
	addr := fmt.Sprintf(":%d", *port)
	url := fmt.Sprintf("http://localhost:%d", *port)

	log.Printf("k999s starting on %s", url)
	go openBrowser(url)

	if err := router.Run(addr); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func openBrowser(url string) {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		cmd, args = "open", []string{url}
	case "linux":
		cmd, args = "xdg-open", []string{url}
	default:
		cmd, args = "cmd", []string{"/c", "start", url}
	}
	_ = exec.Command(cmd, args...).Start()
}
