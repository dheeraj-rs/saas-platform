'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from 'react-beautiful-dnd';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Activity,
  Shield,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  Settings,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/language-switcher';

interface Widget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'alert' | 'activity';
  title: string;
  description?: string;
  position: { x: number; y: number; width: number; height: number };
  data: any;
  refreshInterval?: number;
  lastUpdated: Date;
}

interface DashboardData {
  metrics: {
    totalUsers: number;
    activeUsers: number;
    securityAlerts: number;
    systemUptime: string;
    apiRequests: number;
    responseTime: string;
  };
  charts: {
    userActivity: Array<{ time: string; users: number; requests: number }>;
    securityEvents: Array<{ date: string; threats: number; blocked: number }>;
    performanceMetrics: Array<{
      metric: string;
      value: number;
      change: number;
    }>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    user: string;
    timestamp: Date;
    status: 'success' | 'warning' | 'error';
  }>;
  securityAlerts: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    timestamp: Date;
  }>;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useTranslation('common');

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null
  );
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [publicIp, setPublicIp] = useState<string | null>(null);

  // Helper: keep only login/logout activities (drop heartbeats and others)
  type ActivityItem = DashboardData['recentActivity'][number];
  const filterActivity = useCallback(
    (list: ActivityItem[]): ActivityItem[] => {
      if (!Array.isArray(list)) return [];
      return list.filter((a) => a && (a.action === 'login' || a.action === 'logout'));
    },
    []
  );

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  // Load dashboard data
  const loadDashboardData = useCallback(async () => {
    if (!session?.user) return;

    try {
      setRefreshing(true);
      const response = await fetch('/api/dashboard', {
        headers: {
          Authorization: `Bearer ${(session as any).accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Ensure only login/logout activities are kept in recentActivity
        if (Array.isArray(data?.recentActivity)) {
          data.recentActivity = filterActivity(data.recentActivity);
        }
        setDashboardData(data);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, filterActivity]);

  // Request geolocation (best-effort)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGeo({ lat: latitude, lng: longitude });
      },
      () => {
        // ignore permission errors; we can still send heartbeats without coords
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

  // Fetch public IP (best-effort) once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('https://api.ipify.org?format=json');
        if (!r.ok) return;
        const j = await r.json();
        if (mounted) setPublicIp(j.ip);
      } catch { }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Send presence heartbeat periodically
  useEffect(() => {
    if (!session?.user) return;
    let stopped = false;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coords: geo || undefined,
            ip: publicIp || undefined,
          }),
        });
        // refresh dashboard immediately after heartbeat
        await loadDashboardData();
      } catch { }
    };

    // initial heartbeat
    sendHeartbeat();
    const id = setInterval(() => {
      if (!stopped) sendHeartbeat();
    }, 10000); // every 10s

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        loadDashboardData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session?.user, geo, publicIp, loadDashboardData]);

  // Fetch public IP (best-effort) once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('https://api.ipify.org?format=json');
        if (!r.ok) return;
        const j = await r.json();
        if (mounted) setPublicIp(j.ip);
      } catch { }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-refresh dashboard data
  useEffect(() => {
    if (!session?.user) return;
    // initial load
    loadDashboardData();
    const id = setInterval(() => {
      loadDashboardData();
    }, 3000); // every 3s for near real-time
    return () => clearInterval(id);
  }, [session?.user, loadDashboardData]);

  // Live updates via SSE (presence stream)
  useEffect(() => {
    if (!session?.user) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/presence/stream');
      const onEvent = (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data || '{}');
          setDashboardData((prev) => {
            if (!prev) return prev;
            // Filter incoming activity to only login/logout
            const incomingList = Array.isArray(payload.recentActivity)
              ? filterActivity(payload.recentActivity as ActivityItem[])
              : null;

            // Compute active users: prefer server number, else adjust by login/logout deltas
            let nextActive = prev.metrics.activeUsers;
            if (typeof payload.activeUsers === 'number') {
              nextActive = payload.activeUsers;
            } else if (incomingList) {
              let delta = 0;
              for (const a of incomingList) {
                if (a.action === 'login') delta += 1;
                if (a.action === 'logout') delta -= 1;
              }
              nextActive = Math.max(0, nextActive + delta);
            }

            return {
              ...prev,
              metrics: {
                ...prev.metrics,
                activeUsers: nextActive,
              },
              recentActivity: incomingList ?? prev.recentActivity,
            };
          });
        } catch { }
      };
      es.addEventListener('snapshot', onEvent as any);
      es.addEventListener('update', onEvent as any);
      const onPing = () => { };
      es.addEventListener('ping', onPing as any);
    } catch { }
    return () => {
      try {
        es && es.close();
      } catch { }
    };
  }, [session?.user, filterActivity]);

  // Mark offline on tab close/refresh
  useEffect(() => {
    if (!session?.user) return;
    const onBeforeUnload = () => {
      try {
        const data = JSON.stringify({ offline: true });
        const blob = new Blob([data], { type: 'application/json' });
        navigator.sendBeacon('/api/presence', blob);
      } catch {
        // ignore
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session?.user]);

  // Initialize widgets
  useEffect(() => {
    if (dashboardData) {
      console.log('dashboardData :', dashboardData);
      const defaultWidgets: Widget[] = [
        {
          id: 'total-users',
          type: 'metric',
          title: t('dashboard.totalUsers'),
          position: { x: 0, y: 0, width: 3, height: 1 },
          data: {
            value: dashboardData.metrics.totalUsers,
            change: '+12%',
            trend: 'up',
            icon: Users,
          },
          lastUpdated: new Date(),
        },
        {
          id: 'active-users',
          type: 'metric',
          title: t('dashboard.activeUsers'),
          position: { x: 3, y: 0, width: 3, height: 1 },
          data: {
            value: dashboardData.metrics.activeUsers,
            change: '+5%',
            trend: 'up',
            icon: Activity,
          },
          lastUpdated: new Date(),
        },
        {
          id: 'security-alerts',
          type: 'metric',
          title: t('dashboard.securityAlerts'),
          position: { x: 6, y: 0, width: 3, height: 1 },
          data: {
            value: dashboardData.metrics.securityAlerts,
            change: '-3%',
            trend: 'down',
            icon: Shield,
            severity: dashboardData.metrics.securityAlerts > 5 ? 'high' : 'low',
          },
          lastUpdated: new Date(),
        },
        {
          id: 'system-uptime',
          type: 'metric',
          title: t('dashboard.systemUptime'),
          position: { x: 9, y: 0, width: 3, height: 1 },
          data: {
            value: dashboardData.metrics.systemUptime,
            status: 'operational',
            icon: CheckCircle,
          },
          lastUpdated: new Date(),
        },
        {
          id: 'user-activity-chart',
          type: 'chart',
          title: t('dashboard.userActivity', { defaultValue: 'User Activity' }),
          description: t('dashboard.userActivityDesc', {
            defaultValue: 'Active users and API requests over time',
          }),
          position: { x: 0, y: 1, width: 6, height: 3 },
          data: {
            chartType: 'area',
            data: dashboardData.charts.userActivity,
            xKey: 'time',
            lines: [
              {
                key: 'users',
                name: t('dashboard.users', { defaultValue: 'Users' }),
                color: '#0088FE',
              },
              {
                key: 'requests',
                name: t('dashboard.apiRequests', {
                  defaultValue: 'API Requests',
                }),
                color: '#00C49F',
              },
            ],
          },
          refreshInterval: 30000, // 30 seconds
          lastUpdated: new Date(),
        },
        {
          id: 'security-events-chart',
          type: 'chart',
          title: t('dashboard.securityEvents'),
          description: t('dashboard.securityEventsDesc', {
            defaultValue: 'Threats detected and blocked',
          }),
          position: { x: 6, y: 1, width: 6, height: 3 },
          data: {
            chartType: 'bar',
            data: dashboardData.charts.securityEvents,
            xKey: 'date',
            bars: [
              {
                key: 'threats',
                name: t('dashboard.threats', { defaultValue: 'Threats' }),
                color: '#FF8042',
              },
              {
                key: 'blocked',
                name: t('dashboard.blocked', { defaultValue: 'Blocked' }),
                color: '#00C49F',
              },
            ],
          },
          refreshInterval: 60000, // 1 minute
          lastUpdated: new Date(),
        },
        {
          id: 'recent-activity',
          type: 'activity',
          title: 'Recent Activity',
          description: 'Latest system events and user actions',
          position: { x: 0, y: 4, width: 6, height: 3 },
          data: dashboardData.recentActivity,
          refreshInterval: 15000, // 15 seconds
          lastUpdated: new Date(),
        },
        {
          id: 'security-alerts-widget',
          type: 'alert',
          title: 'Security Alerts',
          description: 'Active security incidents and threats',
          position: { x: 6, y: 4, width: 6, height: 3 },
          data: dashboardData.securityAlerts,
          refreshInterval: 30000, // 30 seconds
          lastUpdated: new Date(),
        },
      ];

      setWidgets(defaultWidgets);
    }
  }, [dashboardData, t]);

  // Load data on component mount
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle drag and drop
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(widgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setWidgets(items);

    // Save layout to backend
    saveWidgetLayout(items);
  };

  const saveWidgetLayout = async (updatedWidgets: Widget[]) => {
    if (!session?.user) return;

    try {
      await fetch('/api/dashboard/layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(session as any).accessToken}`,
        },
        body: JSON.stringify({
          widgets: updatedWidgets.map((w) => ({
            id: w.id,
            position: w.position,
          })),
        }),
      });
    } catch (error) {
      console.error('Failed to save widget layout:', error);
    }
  };

  const renderMetricWidget = (widget: Widget) => (
    <div className="widget-content p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {widget.data.icon && (
            <widget.data.icon className="w-6 h-6 text-primary" />
          )}
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {widget.title}
            </p>
            <p className="text-2xl font-bold">{widget.data.value}</p>
          </div>
        </div>

        {widget.data.change && (
          <div
            className={`flex items-center gap-1 text-sm ${widget.data.trend === 'up'
              ? 'text-green-600'
              : widget.data.trend === 'down'
                ? 'text-red-600'
                : 'text-gray-600'
              }`}
          >
            {widget.data.trend === 'up' ? (
              <TrendingUp className="w-4 h-4" />
            ) : widget.data.trend === 'down' ? (
              <TrendingDown className="w-4 h-4" />
            ) : null}
            {widget.data.change}
          </div>
        )}
      </div>

      {widget.data.severity && (
        <Badge
          variant={
            widget.data.severity === 'high' ? 'destructive' : 'secondary'
          }
          className="mt-2"
        >
          {widget.data.severity === 'high' ? 'Attention Required' : 'Normal'}
        </Badge>
      )}
    </div>
  );

  const renderChartWidget = (widget: Widget) => (
    <div className="widget-content p-6">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {widget.data.chartType === 'area' ? (
            <AreaChart data={widget.data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={widget.data.xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              {widget.data.lines?.map((line: any, index: number) => (
                <Area
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stackId="1"
                  stroke={line.color}
                  fill={line.color}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          ) : widget.data.chartType === 'bar' ? (
            <BarChart data={widget.data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={widget.data.xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              {widget.data.bars?.map((bar: any) => (
                <Bar key={bar.key} dataKey={bar.key} fill={bar.color} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={widget.data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={widget.data.xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              {widget.data.lines?.map((line: any) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderActivityWidget = (widget: Widget) => (
    <div className="widget-content">
      <div className="max-h-64 overflow-y-auto">
        <div className="space-y-3 p-4">
          {widget.data.map((activity: any, index: number) => (
            <div key={activity.id || index} className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${activity.status === 'success'
                  ? 'bg-green-500'
                  : activity.status === 'warning'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                  }`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {activity.action}
                </p>
                <p className="text-xs text-muted-foreground">{activity.user}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(activity.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAlertWidget = (widget: Widget) => (
    <div className="widget-content">
      <div className="max-h-64 overflow-y-auto">
        <div className="space-y-3 p-4">
          {widget.data.map((alert: any, index: number) => (
            <div
              key={alert.id || index}
              className="border-l-4 border-l-red-500 pl-3 py-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {alert.description}
                  </p>
                </div>
                <Badge
                  variant={
                    alert.severity === 'critical'
                      ? 'destructive'
                      : alert.severity === 'high'
                        ? 'destructive'
                        : alert.severity === 'medium'
                          ? 'secondary'
                          : 'outline'
                  }
                  className="ml-2"
                >
                  {alert.severity}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {new Date(alert.timestamp).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderWidget = (widget: Widget) => {
    switch (widget.type) {
      case 'metric':
        return renderMetricWidget(widget);
      case 'chart':
        return renderChartWidget(widget);
      case 'activity':
        return renderActivityWidget(widget);
      case 'alert':
        return renderAlertWidget(widget);
      default:
        return <div className="widget-content p-6">Unknown widget type</div>;
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="flex items-center justify-center min-h-screen">
          <div className="loading-spinner w-8 h-8" />
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-main">
        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-content">
            <div>
              <h1 className="dashboard-title">{t('dashboard.title')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.welcome')}, {session.user.name}
              </p>
            </div>

            <div className="dashboard-actions">
              <LanguageSwitcher />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await fetch('/api/presence', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ offline: true }),
                    });
                  } catch { }
                  await signOut({ callbackUrl: '/auth/login' });
                }}
              >
                {t('auth.logout', { defaultValue: 'Logout' })}
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {t('dashboard.lastUpdated')}: {lastRefresh.toLocaleTimeString()}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={loadDashboardData}
                disabled={refreshing}
              >
                {refreshing ? (
                  <div className="loading-spinner w-4 h-4 mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {t('dashboard.refresh')}
              </Button>

              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                {t('dashboard.customize')}
              </Button>
            </div>
          </div>
        </div>

        {/* Widget Grid */}
        <div className="dashboard-content">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="dashboard">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="widgets-grid"
                >
                  {widgets.map((widget, index) => (
                    <Draggable
                      key={widget.id}
                      draggableId={widget.id}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`widget ${snapshot.isDragging ? 'dragging' : ''
                            }`}
                          style={{
                            ...provided.draggableProps.style,
                            gridColumn: `span ${widget.position.width}`,
                            gridRow: `span ${widget.position.height}`,
                          }}
                        >
                          <div
                            className="widget-header"
                            {...provided.dragHandleProps}
                          >
                            <div>
                              <h3 className="widget-title">{widget.title}</h3>
                              {widget.description && (
                                <p className="text-xs text-muted-foreground">
                                  {widget.description}
                                </p>
                              )}
                            </div>
                            <div className="widget-actions">
                              <div className="real-time-indicator">
                                <div className="real-time-dot" />
                                <span className="real-time-text">Live</span>
                              </div>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                          {renderWidget(widget)}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>
    </div>
  );
}
