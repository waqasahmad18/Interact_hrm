"use client";

import React from "react";
import { resolveEmployeePhoto } from "@/lib/employee-photo-shared";
import { fetchOrgChartPhotosBundle } from "@/lib/org-chart-photos-client-cache";

type PhotoMaps = {
  employeePhotos: Record<string, string>;
  shellAvatars: Record<string, string>;
};

export function useEmployeePhotoMap() {
  const [maps, setMaps] = React.useState<PhotoMaps>({
    employeePhotos: {},
    shellAvatars: {},
  });

  React.useEffect(() => {
    let cancelled = false;
    void fetchOrgChartPhotosBundle()
      .then((bundle) => {
        if (cancelled) return;
        setMaps({
          employeePhotos: bundle.employeePhotos,
          shellAvatars: bundle.employeeAvatars,
        });
      })
      .catch(() => {
        /* keep empty maps */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getPhoto = React.useCallback(
    (employeeId: string | number | null | undefined) => {
      if (employeeId === null || employeeId === undefined || employeeId === "") return null;
      return resolveEmployeePhoto(String(employeeId), maps.employeePhotos, maps.shellAvatars);
    },
    [maps]
  );

  return { getPhoto };
}
