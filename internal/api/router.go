package api

import (
	"embed"
	"io/fs"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/k999s/dashboard/internal/config"
	"github.com/k999s/dashboard/internal/diagnostic"
	"github.com/k999s/dashboard/internal/k8s"
	"github.com/k999s/dashboard/internal/ws"
)

type Router struct {
	engine     *gin.Engine
	k8s        *k8s.Client
	hub        *ws.Hub
	diagnostic diagnostic.Provider
	cfg        *config.Config
	mu         sync.RWMutex
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewRouter(k8sClient *k8s.Client, webFS embed.FS, hub *ws.Hub, diag diagnostic.Provider, cfg *config.Config) *Router {
	gin.SetMode(gin.ReleaseMode)
	r := &Router{engine: gin.New(), k8s: k8sClient, hub: hub, diagnostic: diag, cfg: cfg}
	r.engine.Use(gin.Recovery())
	r.engine.Use(corsMiddleware())

	v1 := r.engine.Group("/api/v1")
	v1.GET("/pods", r.handleListPods)
	v1.GET("/namespaces", r.handleListNamespaces)
	v1.GET("/contexts", r.handleListContexts)
	v1.GET("/deployments", r.handleListDeployments)
	v1.GET("/statefulsets", r.handleListStatefulSets)
	v1.GET("/services", r.handleListServices)
	v1.GET("/nodes", r.handleListNodes)
	v1.GET("/namespace-summaries", r.handleListNamespaceSummaries)
	v1.GET("/configmaps", r.handleListConfigMaps)
	v1.GET("/secrets", r.handleListSecrets)
	v1.GET("/events", r.handleListEvents)
	v1.GET("/pod-metrics", r.handlePodMetrics)
	v1.GET("/node-metrics", r.handleNodeMetrics)
	v1.GET("/pods/:namespace/:name/containers", r.handlePodContainers)
	v1.GET("/topology", r.handleGetTopology)
	v1.GET("/api-resources", r.handleAPIResources)
	v1.GET("/resource-list", r.handleResourceList)
	v1.GET("/resource-get", r.handleResourceGet)
	v1.PUT("/resource-apply", r.handleResourceApply)
	v1.GET("/detected-crds", r.handleDetectedCRDs)
	v1.POST("/contexts/switch", r.handleSwitchContext)
	v1.DELETE("/pods/:namespace/:name", r.handleDeletePod)
	v1.POST("/pods/:namespace/:name/restart", r.handleRestartPod)
	v1.POST("/deployments/:namespace/:name/scale", r.handleScaleDeployment)
	v1.POST("/deployments/:namespace/:name/rollout-restart", r.handleRolloutRestartDeployment)
	v1.DELETE("/deployments/:namespace/:name", r.handleDeleteDeployment)
	v1.GET("/settings", r.handleGetSettings)
	v1.PUT("/settings", r.handleSaveSettings)

	r.engine.GET("/ws/pods/:namespace/:name/logs", r.handlePodLogs)
	r.engine.GET("/ws/pods/:namespace/:name/exec", r.handlePodExec)
	r.engine.GET("/ws/pods/:namespace/:name/diagnose", r.handleDiagnose)
	if hub != nil {
		r.engine.GET("/ws", r.handleWebSocket)
	}

	sub, err := fs.Sub(webFS, "dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(sub))
		r.engine.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if _, statErr := fs.Stat(sub, path[1:]); statErr != nil {
				c.Request.URL.Path = "/"
			}
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	} else {
		r.engine.NoRoute(func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		})
	}
	return r
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.engine.ServeHTTP(w, req)
}

func (r *Router) Run(addr string) error { return r.engine.Run(addr) }

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "http://localhost:5173")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
