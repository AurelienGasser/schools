export type EsriFieldType =
  | "esriFieldTypeOID"
  | "esriFieldTypeString"
  | "esriFieldTypeDouble"
  | "esriFieldTypeInteger"
  | "esriFieldTypeDate";

export interface EsriField {
  name: string;
  type: EsriFieldType;
  alias: string;
  sqlType: string;
  length?: number;
  domain: null;
  defaultValue: null;
}

export interface SchoolAttributes {
  OBJECTID: number;
  LEGAL_NAME: string;
  PHYSADDRLINE1: string;
  PHYSADDRLINE2: string;
  PHYSCITY: string;
  PHYSICALSTATE: string;
  PHYSZIPCD5: string;
  COUNTY_DESC: string;
  Contact_Name: string;
  CEO_TITLE: string;
  CEO_PHONENUM: string;
  CEO_EMAIL: string;
  INST_TYPE_DESC: string;
  INSTSUBTYPDESC: string;
  RECORD_TYPE_DESC: string;
  COMMUNITY_TYPE_DESC: string;
  DIST_TYPE_DESC: string;
  SDL_DESC: string;
  INSTIT_ID: number;
  SED_CODE: string;
  sqr?: Record<string, string>;
  DBN?: string;
}

export interface SchoolFeature {
  attributes: SchoolAttributes;
  geometry: {
    x: number;
    y: number;
  };
}

export interface SchoolsResponse {
  objectIdFieldName: string;
  uniqueIdField: {
    name: string;
    isSystemMaintained: boolean;
  };
  globalIdFieldName: string;
  geometryType: string;
  spatialReference: {
    wkid: number;
    latestWkid: number;
  };
  fields: EsriField[];
  exceededTransferLimit: boolean;
  features: SchoolFeature[];
}
