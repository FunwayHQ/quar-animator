import styles from './PropertiesPanel.module.css';

export function PropertiesPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Properties</h3>
      </div>
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Transform</span>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel}>Position</label>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>X</span>
                  <input type="text" className={styles.input} defaultValue="0" />
                </div>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>Y</span>
                  <input type="text" className={styles.input} defaultValue="0" />
                </div>
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel}>Size</label>
              <div className={styles.propertyInputs}>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>W</span>
                  <input type="text" className={styles.input} defaultValue="100" />
                </div>
                <div className={styles.inputGroup}>
                  <span className={styles.inputLabel}>H</span>
                  <input type="text" className={styles.input} defaultValue="100" />
                </div>
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel}>Rotation</label>
              <div className={styles.propertyInputs}>
                <input type="text" className={styles.input} defaultValue="0°" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Appearance</span>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel}>Fill</label>
              <div className={styles.propertyInputs}>
                <div className={styles.colorSwatch} style={{ backgroundColor: '#3B82F6' }} />
                <input type="text" className={styles.input} defaultValue="#3B82F6" />
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel}>Stroke</label>
              <div className={styles.propertyInputs}>
                <div className={styles.colorSwatch} style={{ backgroundColor: '#1E40AF' }} />
                <input type="text" className={styles.input} defaultValue="#1E40AF" />
              </div>
            </div>
            <div className={styles.propertyRow}>
              <label className={styles.propertyLabel}>Opacity</label>
              <div className={styles.propertyInputs}>
                <input type="range" className={styles.slider} min="0" max="100" defaultValue="100" />
                <input type="text" className={styles.inputSmall} defaultValue="100%" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.emptyState}>
          <span>Select an object to view properties</span>
        </div>
      </div>
    </div>
  );
}

export default PropertiesPanel;
