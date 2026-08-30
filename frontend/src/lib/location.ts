import type { LocationContext } from "./types";

export class LocationRequestError extends Error {
  permission: LocationContext["permission"];

  constructor(permission: LocationContext["permission"], message: string) {
    super(message);
    this.permission = permission;
  }
}

export function requestCurrentLocation(): Promise<LocationContext> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new LocationRequestError("unavailable", "当前设备不支持位置授权"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(3));
        const longitude = Number(position.coords.longitude.toFixed(3));
        resolve({
          permission: "granted",
          label: "当前位置附近",
          latitude,
          longitude,
          accuracyMeters: Math.round(position.coords.accuracy),
          updatedAt: Date.now(),
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        reject(new LocationRequestError(
          denied ? "denied" : "unavailable",
          denied ? "位置授权已关闭，你仍可不使用位置继续思考" : "暂时无法获取位置，你仍可继续思考",
        ));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
