package api

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/k999s/dashboard/internal/diagnostic"
)

func maskAPIKey(key string) string {
	if len(key) <= 4 {
		return strings.Repeat("•", len(key))
	}
	return strings.Repeat("•", len(key)-4) + key[len(key)-4:]
}

func (r *Router) handleGetSettings(c *gin.Context) {
	r.mu.RLock()
	ai := r.cfg.AI
	r.mu.RUnlock()
	masked := ai.APIKey
	if masked != "" {
		masked = maskAPIKey(masked)
	}
	c.JSON(http.StatusOK, gin.H{
		"provider": ai.Provider,
		"model":    ai.Model,
		"apiKey":   masked,
		"baseURL":  ai.BaseURL,
	})
}

func (r *Router) handleSaveSettings(c *gin.Context) {
	var body struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
		APIKey   string `json:"apiKey"`
		BaseURL  string `json:"baseURL"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cfg.AI.Provider = body.Provider
	r.cfg.AI.Model = body.Model
	r.cfg.AI.BaseURL = body.BaseURL
	// Only update key if a real key is sent (not a masked placeholder)
	if body.APIKey != "" && !strings.Contains(body.APIKey, "•") {
		r.cfg.AI.APIKey = body.APIKey
	}
	if err := r.cfg.Save(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Hot-reload diagnostic provider
	provider, _ := diagnostic.New(r.cfg.AI)
	r.diagnostic = provider
	c.Status(http.StatusNoContent)
}

func (r *Router) handleListPods(c *gin.Context) {
	namespace := c.Query("namespace")
	pods, err := r.k8s.ListPods(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": pods})
}

func (r *Router) handleListNamespaces(c *gin.Context) {
	namespaces, err := r.k8s.ListNamespaces(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": namespaces})
}

func (r *Router) handleListContexts(c *gin.Context) {
	contexts, err := r.k8s.GetContexts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": contexts})
}

func (r *Router) handleListDeployments(c *gin.Context) {
	namespace := c.Query("namespace")
	deployments, err := r.k8s.ListDeployments(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": deployments})
}

func (r *Router) handleListStatefulSets(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.k8s.ListStatefulSets(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleDeletePod(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.DeletePod(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleRestartPod(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.RestartPod(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleScaleDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	var body struct {
		Replicas int32 `json:"replicas"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "replicas required"})
		return
	}
	if err := r.k8s.ScaleDeployment(c.Request.Context(), ns, name, body.Replicas); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleRolloutRestartDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.RolloutRestartDeployment(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleDeleteDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.DeleteDeployment(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleListServices(c *gin.Context) {
	svcs, err := r.k8s.ListServices(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": svcs})
}

func (r *Router) handleListNodes(c *gin.Context) {
	nodes, err := r.k8s.ListNodes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": nodes})
}

func (r *Router) handleListNamespaceSummaries(c *gin.Context) {
	nss, err := r.k8s.ListNamespaceSummaries(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": nss})
}

func (r *Router) handleListConfigMaps(c *gin.Context) {
	cms, err := r.k8s.ListConfigMaps(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": cms})
}

func (r *Router) handleListSecrets(c *gin.Context) {
	secrets, err := r.k8s.ListSecrets(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": secrets})
}

func (r *Router) handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	r.hub.Register(conn)
	defer r.hub.Unregister(conn)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (r *Router) handleListEvents(c *gin.Context) {
	events, err := r.k8s.ListEvents(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events})
}

func (r *Router) handlePodMetrics(c *gin.Context) {
	metrics, err := r.k8s.ListPodMetrics(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": metrics})
}

func (r *Router) handleNodeMetrics(c *gin.Context) {
	metrics, err := r.k8s.ListNodeMetrics(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": metrics})
}

func (r *Router) handlePodContainers(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	containers, err := r.k8s.ContainersForPod(c.Request.Context(), ns, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": containers})
}

func (r *Router) handlePodLogs(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	container := c.Query("container")
	follow := c.Query("follow") == "true"
	previous := c.Query("previous") == "true"

	var tailLines int64
	if tailStr := c.Query("tail"); tailStr != "" {
		if n, err := strconv.ParseInt(tailStr, 10, 64); err == nil && n > 0 {
			tailLines = n
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	stream, err := r.k8s.StreamLogs(ctx, ns, name, container, follow, previous, tailLines)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("error: "+err.Error()))
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		if ctx.Err() != nil {
			break
		}
		if err := conn.WriteMessage(websocket.TextMessage, scanner.Bytes()); err != nil {
			break
		}
	}
}

func (r *Router) handlePodExec(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	container := c.Query("container")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	stdinR, stdinW := io.Pipe()
	stdoutR, stdoutW := io.Pipe()

	go func() {
		defer stdinW.Close()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
			_, _ = stdinW.Write(msg)
		}
	}()

	go func() {
		defer stdoutR.Close()
		buf := make([]byte, 4096)
		for {
			n, err := stdoutR.Read(buf)
			if n > 0 {
				_ = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()

	cmd := []string{"sh", "-c", "bash 2>/dev/null || sh"}
	if err := r.k8s.ExecPod(ctx, ns, name, container, cmd, stdinR, stdoutW, stdoutW); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n[session ended: "+err.Error()+"]\r\n"))
	}
	stdoutW.Close()
}

func (r *Router) handleGetTopology(c *gin.Context) {
	namespace := c.Query("namespace")
	if namespace == "" {
		namespace = "default"
	}
	graph, err := r.k8s.GetTopology(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, graph)
}

func (r *Router) handleAPIResources(c *gin.Context) {
	resources, err := r.k8s.ListAPIResources()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": resources})
}

func (r *Router) handleResourceList(c *gin.Context) {
	group := c.Query("group")
	version := c.Query("version")
	resource := c.Query("resource")
	namespace := c.Query("namespace")
	if version == "" || resource == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version and resource are required"})
		return
	}
	items, err := r.k8s.ListResourceRaw(c.Request.Context(), group, version, resource, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleResourceGet(c *gin.Context) {
	group := c.Query("group")
	version := c.Query("version")
	resource := c.Query("resource")
	namespace := c.Query("namespace")
	name := c.Query("name")
	if version == "" || resource == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version, resource, and name are required"})
		return
	}
	raw, err := r.k8s.GetResourceRaw(c.Request.Context(), group, version, resource, namespace, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", raw)
}

func (r *Router) handleSwitchContext(c *gin.Context) {
	var body struct {
		Context string `json:"context" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "context is required"})
		return
	}
	if err := r.k8s.SwitchContext(body.Context); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"context": body.Context})
}

func (r *Router) handleResourceApply(c *gin.Context) {
	var body struct {
		Group     string         `json:"group"`
		Version   string         `json:"version"`
		Resource  string         `json:"resource"`
		Namespace string         `json:"namespace"`
		Name      string         `json:"name"`
		Data      map[string]any `json:"data"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	data, _ := json.Marshal(body.Data)
	// Use background context with timeout — request context may be cancelled
	// before K8s completes, leaving the transport pool in a broken state.
	applyCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := r.k8s.ApplyResourceRaw(applyCtx, body.Group, body.Version, body.Resource, body.Namespace, body.Name, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleDetectedCRDs(c *gin.Context) {
	presence := r.k8s.DetectCRDs()
	c.JSON(http.StatusOK, presence)
}

func (r *Router) handleDiagnose(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	r.mu.RLock()
	diag := r.diagnostic
	r.mu.RUnlock()
	if diag == nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(
			"AI diagnostic is not configured.\n\nGo to Settings and configure a provider, or add to ~/.k999s/config.yaml:\n\nai:\n  provider: ollama\n  model: llama3.2\n",
		))
		return
	}

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	// Notify client that data collection has started
	_ = conn.WriteMessage(websocket.TextMessage, []byte("⏳ Collecting pod diagnostics (status, logs, events)...\n\n"))

	// Collect rich pod context: container states, exit codes, previous logs, events
	podCtx, err := r.k8s.GetPodDiagnosticContext(ctx, ns, name)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Error collecting pod data: %v\n", err)))
		return
	}

	input := diagnostic.DiagnosticInput{
		PodName:      name,
		Namespace:    ns,
		PodDetails:   podCtx.PodDetails,
		CurrentLogs:  podCtx.CurrentLogs,
		PreviousLogs: podCtx.PreviousLogs,
		Events:       podCtx.Events,
	}

	ch, err := diag.Diagnose(ctx, input)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}

	tokenCount := 0
	for token := range ch {
		if ctx.Err() != nil {
			break
		}
		if err := conn.WriteMessage(websocket.TextMessage, []byte(token)); err != nil {
			break
		}
		tokenCount++
	}
	if tokenCount == 0 && ctx.Err() == nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(
			"AI provider returned an empty response.\n\nPossible causes:\n• Model name is incorrect\n• API key is invalid or expired\n• Provider is not reachable\n\nCheck Settings or ~/.k999s/config.yaml",
		))
	}
}
