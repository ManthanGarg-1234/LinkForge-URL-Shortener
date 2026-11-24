import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  ExternalLink,
  Link2,
  MousePointerClick,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyticsApi, urlApi } from "../services/api.js";

const CHART_COLORS = [
  "#60a5fa",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#22d3ee",
  "#e879f9",
];

const LINK_PAGE_SIZE = 100;

function getErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Unable to load analytics."
  );
}

function unwrapResponse(response) {
  const payload = response?.data ?? response;
  return payload?.data ?? payload;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00Z`);

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function MetricCard({ title, value, description, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#101725] p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-400">{title}</span>
        <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400">
          <Icon size={20} />
        </div>
      </div>

      <p className="mt-5 text-3xl font-bold tabular-nums text-white">
        {formatNumber(value)}
      </p>

      <p className="mt-2 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b101d] px-4 py-3 shadow-xl">
      <p className="mb-1 text-xs text-zinc-400">{label}</p>
      <p className="text-sm font-semibold text-blue-300">
        {formatNumber(payload[0].value)} clicks
      </p>
    </div>
  );
}

function AnalyticsEmptyState({ message }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#101725]/60 px-6 text-center">
      <Activity size={28} className="text-zinc-600" />
      <p className="mt-4 text-sm font-medium text-zinc-300">
        No analytics data yet
      </p>
      <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">{message}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState(null);
  const [allLinks, setAllLinks] = useState([]);
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [linkAnalytics, setLinkAnalytics] = useState(null);

  const [loading, setLoading] = useState(true);
  const [linksLoading, setLinksLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [error, setError] = useState("");
  const [linksError, setLinksError] = useState("");
  const [detailError, setDetailError] = useState("");

  const detailRequestId = useRef(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await analyticsApi.getOverview();
      const data = unwrapResponse(response);

      if (!data || typeof data !== "object") {
        throw new Error("The analytics overview response was invalid.");
      }

      setOverview(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllLinks = useCallback(async () => {
    setLinksLoading(true);
    setLinksError("");

    try {
      const firstResponse = await urlApi.listShortUrls({
        page: 1,
        limit: LINK_PAGE_SIZE,
      });

      const firstPage = unwrapResponse(firstResponse);
      const firstPageLinks = Array.isArray(firstPage?.urls)
        ? firstPage.urls
        : Array.isArray(firstPage?.items)
          ? firstPage.items
          : [];

      const pagination = firstPage?.pagination;
      const totalPages =
        Number.isInteger(pagination?.totalPages) && pagination.totalPages >= 1
          ? pagination.totalPages
          : 1;

      const collectedLinks = [...firstPageLinks];

      for (let page = 2; page <= totalPages; page += 1) {
        const response = await urlApi.listShortUrls({
          page,
          limit: LINK_PAGE_SIZE,
        });

        const data = unwrapResponse(response);
        const pageLinks = Array.isArray(data?.urls)
          ? data.urls
          : Array.isArray(data?.items)
            ? data.items
            : [];

        collectedLinks.push(...pageLinks);

        if (pageLinks.length === 0) {
          break;
        }
      }

      setAllLinks(collectedLinks);

      setSelectedLinkId((currentId) => {
        if (
          currentId &&
          !collectedLinks.some((link) => link.id === currentId)
        ) {
          return "";
        }

        return currentId;
      });
    } catch (err) {
      setLinksError(getErrorMessage(err));
      setAllLinks([]);
      setSelectedLinkId("");
    } finally {
      setLinksLoading(false);
    }
  }, []);

  const loadLinkAnalytics = useCallback(async (id) => {
    const requestId = ++detailRequestId.current;

    if (!id) {
      setLinkAnalytics(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    setDetailError("");
    setLinkAnalytics(null);

    try {
      const response = await analyticsApi.getLinkAnalytics(id);

      if (requestId !== detailRequestId.current) {
        return;
      }

      const data = unwrapResponse(response);

      if (!data || typeof data !== "object") {
        throw new Error("The link analytics response was invalid.");
      }

      setLinkAnalytics(data);
    } catch (err) {
      if (requestId !== detailRequestId.current) {
        return;
      }

      setLinkAnalytics(null);
      setDetailError(getErrorMessage(err));
    } finally {
      if (requestId === detailRequestId.current) {
        setDetailLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadAllLinks();
  }, [loadOverview, loadAllLinks]);

  useEffect(() => {
    loadLinkAnalytics(selectedLinkId);

    return () => {
      detailRequestId.current += 1;
    };
  }, [selectedLinkId, loadLinkAnalytics]);

  const handleRefresh = useCallback(() => {
    loadOverview();
    loadAllLinks();
  }, [loadOverview, loadAllLinks]);

  const summary = overview?.summary ?? {};
  const dailyClicks = overview?.dailyClicks ?? [];
  const topLinks = overview?.topLinks ?? [];

  const selectedLink = allLinks.find((link) => link.id === selectedLinkId);

  const linkDailyClicks = linkAnalytics?.dailyClicks ?? [];
  const referrers = linkAnalytics?.referrers ?? [];

  const hasClicks = dailyClicks.some((item) => item.clicks > 0);
  const hasLinkClicks = linkDailyClicks.some((item) => item.clicks > 0);

  if (loading && !overview) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <div className="text-center">
          <RefreshCw size={25} className="mx-auto animate-spin text-blue-400" />
          <p className="mt-4 text-sm text-zinc-400">
            Loading your analytics...
          </p>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <section>
        <div className="mb-8">
          <p className="text-sm font-medium text-blue-400">
            PERFORMANCE INSIGHTS
          </p>
          <h1 className="mt-3 text-3xl font-bold">Analytics</h1>
        </div>

        <div
          role="alert"
          className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300"
        >
          {error}
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-blue-400">
            PERFORMANCE INSIGHTS
          </p>

          <h1 className="mt-3 text-3xl font-bold">Analytics</h1>

          <p className="mt-3 text-sm text-zinc-400">
            Understand how your shortened links are performing.
          </p>

          <p className="mt-2 text-xs text-zinc-600">
            Reporting period: last 30 days · Timezone: UTC
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading || linksLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading || linksLoading ? "animate-spin" : ""}
          />
          Refresh data
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Total clicks"
          value={summary.totalClicks}
          description="All recorded redirect requests"
          icon={MousePointerClick}
        />

        <MetricCard
          title="Total links"
          value={summary.totalLinks}
          description="Links created in your account"
          icon={Link2}
        />

        <MetricCard
          title="Active links"
          value={summary.activeLinks}
          description="Links currently marked active"
          icon={TrendingUp}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.07] bg-[#101725] p-6 xl:col-span-2">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Click activity</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Daily redirect requests over the last 30 days
            </p>
          </div>

          {!hasClicks ? (
            <AnalyticsEmptyState message="Share one of your short links to start collecting click activity." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyClicks}
                  margin={{ top: 10, right: 12, left: -18, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#ffffff12"
                    strokeDasharray="4 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={25}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip content={<ChartTooltip />} />

                  <Line
                    type="monotone"
                    dataKey="clicks"
                    name="Clicks"
                    stroke="#60a5fa"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: "#60a5fa",
                      stroke: "#0b101d",
                      strokeWidth: 2,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#101725] p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">
              Top-performing links
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Ranked by total recorded clicks
            </p>
          </div>

          {!topLinks.length ? (
            <AnalyticsEmptyState message="Your most-clicked links will appear here once visitors open them." />
          ) : (
            <div className="space-y-5">
              {topLinks.map((link, index) => {
                const maxClicks = Math.max(
                  ...topLinks.map((item) => item.clicks),
                  1,
                );

                const percentage = Math.max((link.clicks / maxClicks) * 100, 3);

                return (
                  <button
                    key={link.id}
                    onClick={() => setSelectedLinkId(link.id)}
                    className={`block w-full rounded-xl p-3 text-left transition ${
                      selectedLinkId === link.id
                        ? "bg-blue-500/10 ring-1 ring-blue-400/20"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-xs font-semibold text-zinc-400">
                          {index + 1}
                        </span>

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-blue-300">
                            /{link.shortCode}
                          </p>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {link.originalUrl}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                        {formatNumber(link.clicks)}
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-blue-400 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-white/[0.07] bg-[#101725] p-6">
        <div className="mb-6">
          <p className="text-sm font-medium text-blue-400">LINK-LEVEL REPORT</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Individual link analytics
          </h2>
          <p className="mt-2 text-xs text-zinc-500">
            Select any link in your account to inspect its activity and referrer
            origins.
          </p>
        </div>

        <label className="block max-w-xl">
          <span className="text-xs font-medium text-zinc-400">
            Select a link
          </span>

          <select
            value={selectedLinkId}
            onChange={(event) => setSelectedLinkId(event.target.value)}
            disabled={linksLoading || allLinks.length === 0}
            className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b101d] px-4 py-3 text-sm text-white outline-none focus:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">
              {linksLoading
                ? "Loading your links..."
                : allLinks.length > 0
                  ? "Choose a link..."
                  : "No links available"}
            </option>

            {allLinks.map((link) => (
              <option key={link.id} value={link.id}>
                /{link.shortCode} — {link.originalUrl}
              </option>
            ))}
          </select>
        </label>

        {linksLoading && (
          <div className="mt-4 flex items-center gap-3 text-sm text-zinc-400">
            <RefreshCw size={16} className="animate-spin text-blue-400" />
            Loading your links...
          </div>
        )}

        {linksError && !linksLoading && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            <p>{linksError}</p>
            <button
              onClick={loadAllLinks}
              className="mt-3 inline-flex items-center gap-2 font-semibold text-red-200 hover:text-white"
            >
              <RefreshCw size={14} />
              Retry loading links
            </button>
          </div>
        )}

        {!linksLoading && !linksError && allLinks.length === 0 && (
          <div className="mt-6">
            <AnalyticsEmptyState message="Create a short link first. Your links will appear here for individual analytics." />
          </div>
        )}

        {detailLoading && (
          <div className="mt-8 flex items-center gap-3 text-sm text-zinc-400">
            <RefreshCw size={17} className="animate-spin text-blue-400" />
            Loading link analytics...
          </div>
        )}

        {detailError && !detailLoading && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {detailError}
          </div>
        )}

        {selectedLink && linkAnalytics && !detailLoading && (
          <div className="mt-8">
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#0b101d] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-300">
                  /{linkAnalytics.link?.shortCode}
                </p>
                <p className="mt-1 break-all text-xs text-zinc-500">
                  {linkAnalytics.link?.originalUrl}
                </p>
              </div>

              <a
                href={linkAnalytics.link?.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white"
              >
                Destination
                <ExternalLink size={14} />
              </a>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-[#0b101d] p-5">
                <p className="text-xs text-zinc-500">Lifetime clicks</p>
                <p className="mt-3 text-2xl font-bold tabular-nums text-white">
                  {formatNumber(linkAnalytics.summary?.totalClicks)}
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0b101d] p-5">
                <p className="text-xs text-zinc-500">Clicks in last 30 days</p>
                <p className="mt-3 text-2xl font-bold tabular-nums text-white">
                  {formatNumber(linkAnalytics.summary?.clicksLast30Days)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-[#0b101d] p-5">
                <h3 className="text-sm font-semibold text-white">
                  Daily link clicks
                </h3>

                <p className="mt-1 text-xs text-zinc-500">
                  Activity during the last 30 days
                </p>

                {!hasLinkClicks ? (
                  <div className="flex h-56 items-center justify-center text-center text-xs text-zinc-500">
                    No clicks recorded during this period.
                  </div>
                ) : (
                  <div className="mt-4 h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={linkDailyClicks}
                        margin={{
                          top: 10,
                          right: 10,
                          left: -20,
                          bottom: 0,
                        }}
                      >
                        <CartesianGrid
                          stroke="#ffffff12"
                          strokeDasharray="4 4"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDate}
                          tick={{ fill: "#71717a", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          minTickGap={25}
                        />

                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#71717a", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />

                        <Tooltip content={<ChartTooltip />} />

                        <Line
                          type="monotone"
                          dataKey="clicks"
                          stroke="#34d399"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#0b101d] p-5">
                <h3 className="text-sm font-semibold text-white">
                  Referrer origins
                </h3>

                <p className="mt-1 text-xs text-zinc-500">
                  Where recorded visits originated
                </p>

                {!referrers.length ? (
                  <div className="flex h-56 items-center justify-center text-center text-xs text-zinc-500">
                    No referrer information recorded yet.
                  </div>
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={referrers}
                            dataKey="clicks"
                            nameKey="referrer"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={82}
                            paddingAngle={3}
                          >
                            {referrers.map((item, index) => (
                              <Cell
                                key={`${item.referrer}-${index}`}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>

                          <Tooltip
                            formatter={(value) => [
                              formatNumber(value),
                              "Clicks",
                            ]}
                            contentStyle={{
                              background: "#0b101d",
                              border: "1px solid #ffffff20",
                              borderRadius: "12px",
                              color: "#fff",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                      {referrers.map((item, index) => (
                        <div
                          key={`${item.referrer}-${index}`}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  CHART_COLORS[index % CHART_COLORS.length],
                              }}
                            />
                            <span className="truncate text-zinc-400">
                              {item.referrer}
                            </span>
                          </div>

                          <span className="shrink-0 font-semibold tabular-nums text-white">
                            {formatNumber(item.clicks)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {!selectedLinkId && allLinks.length > 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-blue-400/10 bg-blue-400/[0.04] p-4 text-xs text-zinc-400">
            <BarChart3 size={18} className="shrink-0 text-blue-400" />
            Select any link above or click a top-performing link to view its
            individual report.
          </div>
        )}
      </div>

      <p className="mt-6 text-xs leading-5 text-zinc-600">
        Analytics count recorded redirect requests, not unique visitors.
        Referrer information may be unavailable when browsers or privacy
        settings omit the referrer header.
      </p>
    </section>
  );
}
