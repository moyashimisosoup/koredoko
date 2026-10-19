/**
 * APP-023 koredoko: multi-constraint evidence comparison PoC.
 *
 * No location or residence is inferred from coordinates. Inputs are documented
 * public complexes or synthetic abstract candidates with supplied distances.
 * A rank is not a probability and never asserts unique or verified location.
 */

const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = v => typeof v === "number" && Number.isFinite(v);
const nonblank = v => typeof v === "string" && v.trim().length > 0;

function validateScenario(data) {
  if (!isObject(data) || data.schema_version !== "comparison-v0.1" ||
      !["synthetic", "public_named_complex"].includes(data.dataset_kind) ||
      !Array.isArray(data.conditions) || data.conditions.length === 0 || data.conditions.length > 30 ||
      !Array.isArray(data.candidates) || data.candidates.length === 0 || data.candidates.length > 50) {
    throw new Error("Comparison data, scope or size is invalid.");
  }
  const ids = new Set(), candidateIds = new Set();
  for (const c of data.conditions) {
    if (!isObject(c) || !nonblank(c.id) || ids.has(c.id) ||
        !["walk", "built_year", "building_floors"].includes(c.kind)) {
      throw new Error("Invalid or duplicated condition.");
    }
    ids.add(c.id);
    if (c.kind === "walk") {
      if (!nonblank(c.place_id) || !nonblank(c.label) ||
          !Number.isInteger(c.min_minutes) || !Number.isInteger(c.max_minutes) ||
          c.min_minutes < 1 || c.max_minutes > 180 || c.max_minutes < c.min_minutes ||
          c.travel_mode !== "walk_only") {
        throw new Error("Invalid walking advertisement constraint.");
      }
    } else if (!Number.isInteger(c.value) || (c.kind === "building_floors" && c.value < 1) ||
               (c.kind === "built_year" && (c.value < 1850 || c.value > 2100))) {
      throw new Error("Invalid building attribute.");
    }
  }
  for (const candidate of data.candidates) {
    if (!isObject(candidate) || !nonblank(candidate.id) || candidateIds.has(candidate.id) ||
        !nonblank(candidate.label) || !Array.isArray(candidate.distances) || candidate.distances.length > 100 ||
        !isObject(candidate.attributes)) {
      throw new Error("Invalid or duplicated candidate.");
    }
    candidateIds.add(candidate.id);
    for (const d of candidate.distances) {
      if (!isObject(d) || !nonblank(d.place_id) || !nonblank(d.source_id) ||
          !finite(d.meters) || d.meters < 0 || d.meters > 100000 ||
          !["pedestrian_route", "straight_line"].includes(d.method)) {
        throw new Error("Invalid distance measurement.");
      }
      if (d.method === "pedestrian_route" &&
          (typeof d.entrance_verified !== "boolean" || typeof d.graph_pinned !== "boolean" ||
           !finite(d.endpoint_snap_m) || d.endpoint_snap_m < 0)) {
        throw new Error("Route quality evidence missing.");
      }
    }
  }
}

export function canonicalConditions(conditions) {
  const out = [], walks = new Map(), attributes = new Map();
  let duplicates = 0, ambiguities = 0;
  for (const c of conditions) {
    if (c.kind === "walk") {
      const prev = walks.get(c.place_id);
      if (!prev) {
        const copy = { ...c, ambiguous: false };
        walks.set(c.place_id, copy); out.push(copy);
      } else {
        duplicates++;
        if (prev.min_minutes !== c.min_minutes || prev.max_minutes !== c.max_minutes) {
          if (!prev.ambiguous) ambiguities++;
          prev.ambiguous = true;
        }
      }
    } else {
      const prev = attributes.get(c.kind);
      if (!prev) {
        const copy = { ...c, ambiguous: false };
        attributes.set(c.kind, copy); out.push(copy);
      } else {
        duplicates++;
        if (prev.value !== c.value) {
          if (!prev.ambiguous) ambiguities++;
          prev.ambiguous = true;
        }
      }
    }
  }
  return { conditions: out, duplicates, ambiguities };
}

function routeTier(d) {
  return d.method === "pedestrian_route" &&
    d.entrance_verified === true && d.graph_pinned === true &&
    d.endpoint_snap_m <= 25 ? "strong" :
    d.method === "straight_line" ? "weak" : "unverified_route";
}

function unobserved(c, reason = "measurement_missing") {
  return { condition_id: c.id, label: c.label || c.kind,
    status: "unknown", strength: "none", points: 0, reason, observation_m: null };
}

function evaluateWalk(c, candidate) {
  if (c.ambiguous) return unobserved(c, "conflicting_advertised_conditions");
  const records = candidate.distances.filter(d => d.place_id === c.place_id);
  if (!records.length) return unobserved(c);
  const strongs = records.filter(d => routeTier(d) === "strong");
  const weaks = records.filter(d => routeTier(d) === "weak");
  // Never select a convenient measurement when repeated records disagree.
  // Conflicting numbers must be held for review regardless of source ID.
  const selectedTier = strongs.length ? strongs : weaks;
  if (selectedTier.length > 1) {
    const distances = selectedTier.map(x => x.meters);
    if (Math.max(...distances) - Math.min(...distances) > 80) {
      return unobserved(c, "conflicting_distance_observations");
    }
  }
  const preferred = strongs[0] || weaks[0];
  if (!preferred) return unobserved(c, "entrance_or_graph_not_verified");
  const tier = routeTier(preferred);
  const lower = (c.min_minutes - 1) * 80;
  const upper = c.max_minutes * 80;
  const distance = preferred.meters;
  let status, points, reason;
  if (tier === "weak") {
    // A straight-line proxy may lie close to a station center even if the real
    // walking route is far longer. Weak proximity is NOT a match.
    status = distance <= upper ? "hint" : "caution";
    points = distance <= upper ? 1 : -1;
    reason = distance <= upper ? "representative_point_proximity_only" : "proxy_outside_nominal_upper_bound";
  } else if (distance > lower && distance <= upper) {
    status = "match"; points = 3; reason = "qualified_road_distance_in_advertised_band";
  } else if (distance <= lower - 40 || distance > upper + 40) {
    status = "conflict"; points = -4; reason = "qualified_road_distance_outside_band";
  } else {
    status = "review"; points = 0; reason = "near_advertisement_rounding_boundary";
  }
  return { condition_id: c.id, label: c.label, status, strength: tier, points, reason,
    observation_m: distance, advertised_lower_exclusive_m: lower,
    advertised_upper_inclusive_m: upper, source_id: preferred.source_id };
}

function evaluateAttribute(c, candidate) {
  if (c.ambiguous) return unobserved(c, "conflicting_advertised_attributes");
  const a = candidate.attributes[c.kind];
  if (!isObject(a) || !Number.isInteger(a.value) || !nonblank(a.source_id)) return unobserved(c);
  const verified = a.verified === true;
  const consistent = a.value === c.value;
  return { condition_id: c.id, label: c.label || c.kind,
    status: verified ? (consistent ? "match" : "conflict") : (consistent ? "hint" : "caution"),
    strength: verified ? "strong" : "weak",
    points: verified ? (consistent ? 2 : -3) : (consistent ? 1 : -1),
    reason: verified ? "building_attribute_corroborated" : "building_attribute_unverified",
    observed_value: a.value, advertised_value: c.value, source_id: a.source_id };
}

function reportFor(candidate, conditions) {
  const details = conditions.map(c => c.kind === "walk" ? evaluateWalk(c, candidate) : evaluateAttribute(c, candidate));
  const summary = {
    matched: details.filter(x => x.status === "match").length,
    weak_hints: details.filter(x => x.status === "hint").length,
    conflicts: details.filter(x => x.status === "conflict").length,
    cautions: details.filter(x => x.status === "caution").length,
    unknown: details.filter(x => ["unknown","review"].includes(x.status)).length,
  };
  const points = details.reduce((s,x) => s + x.points, 0);
  return { candidate_id: candidate.id, label: candidate.label, points, summary, details,
    corroborated_condition_count: summary.matched, result_state: "unverified_comparison" };
}

export function evaluateCandidates(data) {
  validateScenario(data);
  const canon = canonicalConditions(data.conditions);
  const ranked = data.candidates.map(c => reportFor(c, canon.conditions));
  ranked.sort((a,b) => b.points-a.points || b.summary.matched-a.summary.matched ||
    a.candidate_id.localeCompare(b.candidate_id, "en"));
  const hasEvidence = ranked.some(r => r.summary.matched + r.summary.weak_hints + r.summary.conflicts + r.summary.cautions > 0);
  const uniqueTop = ranked.length === 1 || (ranked.length > 1 && ranked[0].points > ranked[1].points);
  return { schema_version: "comparison-result-v0.1",
    dataset_kind: data.dataset_kind,
    ranking_state: !hasEvidence ? "abstain" : "reference_ranking_only",
    can_confirm_property: false,
    candidate_selection_verified: false,
    scoring: "research_points_not_probability",
    independent_place_conditions: canon.conditions.filter(x => x.kind === "walk").length,
    evaluated_conditions: canon.conditions.length,
    duplicate_conditions_suppressed: canon.duplicates,
    ambiguous_groups_withheld: canon.ambiguities,
    has_unique_provisional_leader: hasEvidence && uniqueTop,
    ranked };
}
