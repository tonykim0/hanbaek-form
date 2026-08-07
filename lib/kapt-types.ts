export type ApartmentCandidate = {
  kaptCode: string;
  name: string;
  address: string;
  roadAddress: string;
  region: string;
  households: number | null;
  approvalDate: string | null;
};

export type InformationItem = {
  label: string;
  value: string;
};

export type ElectricVehicleCharger = {
  id: string;
  location: string;
  installationType: string;
  chargerType: string;
  speed: string;
  count: number | null;
  operator: string;
  operatorPhone: string;
};

export type ApartmentDetail = {
  source: "official" | "kapt";
  updatedAt: string;
  complex: ApartmentCandidate;
  basicInfo: InformationItem[];
  electricVehicle: {
    overview: InformationItem[];
    chargers: ElectricVehicleCharger[];
  };
};
