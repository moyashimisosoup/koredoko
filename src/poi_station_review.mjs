/** Preliminary OpenPOI station-name candidate screening, NOT exit geolocation validation. */
const isNum = n => typeof n === "number" && Number.isFinite(n);
const normalize = value => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g,"").trim() : "";

export function screenStationCandidate(poi, expectedQuery, city) {
  if (!poi || !isNum(poi.lat) || !isNum(poi.lng) ||
      poi.lat < -90 || poi.lat > 90 || poi.lng < -180 || poi.lng > 180) {
    return {status:"reject",reasons:["coordinates_invalid"]};
  }
  const reasons=[];
  if(normalize(poi.name)!==normalize(expectedQuery)) reasons.push("name_is_not_exact");
  if(normalize(poi.city)!==normalize(city)) reasons.push("municipality_mismatch");
  if(poi.category!=="station") reasons.push("not_station_category");
  if(reasons.length) return {status:"reject",reasons};
  if(poi.source!=="n02") return {status:"review",reasons:["station_data_source_requires_review"]};
  return {status:"station_candidate",reasons:["exit_location_not_verified"]};
}

export function haversineMeters(a,b) {
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2) throw new Error("invalid coordinate array");
  const [lat1,lon1]=a,[lat2,lon2]=b;
  if(![lat1,lon1,lat2,lon2].every(isNum)||Math.abs(lat1)>90||Math.abs(lat2)>90||Math.abs(lon1)>180||Math.abs(lon2)>180)
    throw new Error("invalid geographic coordinate");
  const rad=Math.PI/180;
  const p=(lat2-lat1)*rad,q=(lon2-lon1)*rad;
  const x=Math.sin(p/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(q/2)**2;
  return 12742000*Math.asin(Math.sqrt(Math.max(0,Math.min(1,x))));
}

export function exploratoryStationDiskCheck(a,b,aWalkMinutes,bWalkMinutes) {
  /** Only a coarse diagnostic using representative station points and straight-line distances.
    * Not a proof a property is in the overlap or outside it, since station entrance locations
    * and 80m/min reported route distances are uncertain.
    */
  const minutes=[aWalkMinutes,bWalkMinutes];
  if(!minutes.every(n=>Number.isInteger(n)&&n>=1&&n<=180)) throw new Error("invalid walk time");
  const d=haversineMeters([a.lat,a.lng],[b.lat,b.lng]);
  const sumUpper=(aWalkMinutes+bWalkMinutes)*80;
  return {station_direct_distance_m:Math.round(d),
          sum_walk_upper_bounds_m:sumUpper,
          nominal_upper_disks_overlap:d<=sumUpper,
          gate:"exploratory_only_unverified_exits"};
}
