package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/k999s/dashboard/internal/k8s"
)

// Router wraps gin.Engine and holds dependencies.
type Router struct {
	engine *gin.Engine
	k8s    *k8s.Client
}

// NewRouter wires all HTTP routes.
func NewRouter(k8sClient *k8s.Client) *Router {
	gin.SetMode(gin.ReleaseMode)
	r := &Router{engine: gin.New(), k8s: k8sClient}
	r.engine.Use(gin.Recovery())
	r.engine.Use(corsMiddleware())

	v1 := r.engine.Group("/api/v1")
	v1.GET("/pods", r.handleListPods)
	v1.GET("/namespaces", r.handleListNamespaces)
	v1.GET("/contexts", r.handleListContexts)
	v1.GET("/deployments", r.handleListDeployments)

	r.engine.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	return r
}

// ServeHTTP implements http.Handler for testing.
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.engine.ServeHTTP(w, req)
}

// Run starts the HTTP server.
func (r *Router) Run(addr string) error {
	return r.engine.Run(addr)
}

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
