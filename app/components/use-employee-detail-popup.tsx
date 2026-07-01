"use client";

import React from "react";
import { EmployeeDetailPopup } from "./EmployeeDetailPopup";
import { useEmployeePhotoMap } from "./use-employee-photo-map";
import {
  buildEmployeeDetailPayload,
  type EmployeeRowLike,
} from "@/lib/employee-detail-from-row";

export type { EmployeeRowLike };

export function useEmployeeDetailPopup() {
  const [detail, setDetail] = React.useState<Awaited<
    ReturnType<typeof buildEmployeeDetailPayload>
  > | null>(null);
  const { getPhoto } = useEmployeePhotoMap();

  const openFromRow = React.useCallback(
    (row: EmployeeRowLike) => {
      void buildEmployeeDetailPayload(row, getPhoto).then(setDetail);
    },
    [getPhoto]
  );

  const popup = detail ? (
    <EmployeeDetailPopup data={detail} onClose={() => setDetail(null)} />
  ) : null;

  return { detail, openFromRow, close: () => setDetail(null), popup, getPhoto };
}
