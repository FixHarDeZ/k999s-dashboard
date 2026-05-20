package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Message is broadcast to all connected WebSocket clients.
type Message struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Hub manages connected WebSocket clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*websocket.Conn]struct{})}
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
	conn.Close()
}

func (h *Hub) Broadcast(msgType string, data any) {
	msg := Message{Type: msgType, Data: data}
	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			log.Printf("ws: write error: %v", err)
		}
	}
}
