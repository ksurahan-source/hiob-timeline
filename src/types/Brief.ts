/**
 * Composition-level brief types for the HIOB template variable system.
 *
 * A Brief carries copy fields for a video composition. Any string field may
 * contain `{{variable}}` placeholders that `interpolateTemplate` resolves at
 * render time — analogous to Creatomate's variable injection model.
 *
 * @example
 *   const template: Brief = {
 *     headline: "{{brand_name}} 신제품 출시",
 *     cta_text: "지금 {{product_name}} 보러가기",
 *   };
 *   const result = interpolateTemplate(template, {
 *     brand_name: "히오브",
 *     product_name: "비타 세럼",
 *   });
 *   // result.headline === "히오브 신제품 출시"
 *   // result.cta_text  === "지금 비타 세럼 보러가기"
 */

/** The six parameterizable copy fields supported by the template variable system. */
export interface TemplateVariableFields {
  /** Top-level hook line shown as the video's primary overlay text. */
  headline?: string;
  /** Supporting copy rendered below the headline overlay. */
  subheadline?: string;
  /** CTA button label or final-beat caption, e.g. "지금 구매하기". */
  cta_text?: string;
  /** Product or service name injected into copy wherever {{product_name}} appears. */
  product_name?: string;
  /** Brand display name injected wherever {{brand_name}} appears. */
  brand_name?: string;
  /**
   * Scene-setting locale or environment line injected into visual prompts,
   * e.g. "서울 강남 필라테스 스튜디오".
   */
  context_setting?: string;
}

/**
 * A Brief is a flat-or-nested composition template object.
 * Named fields from TemplateVariableFields are typed; all other fields are open.
 */
export type Brief = TemplateVariableFields & Record<string, unknown>;
