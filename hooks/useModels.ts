"use client";

import { useState, useEffect } from "react";

export function useModels() {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => setModels(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { models, loading };
}
